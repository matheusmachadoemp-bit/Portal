import { cache } from "react";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

// Proteção contra força bruta no login: contador gravado no próprio usuário
// (`failedLoginAttempts`/`lockedUntil`), não em memória do processo — em
// produção (Vercel, serverless) cada instância teria sua própria memória, e
// um contador só local não bloqueia nada de verdade sob tráfego real. Depois
// de MAX_ATTEMPTS tentativas erradas seguidas, a conta fica bloqueada por
// LOCKOUT_MS, sem avisar o usuário disso — o `authorize` só devolve null, a
// mesma resposta genérica de credenciais inválidas.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function isLockedOut(user: { lockedUntil: Date | null }): boolean {
  return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
}

// Incrementa atomicamente (via `increment`, não lendo e regravando um valor)
// para que tentativas erradas simultâneas (paralelas) não pisem uma na outra
// e escapem do bloqueio — um `findUnique` seguido de `update({ count + 1 })`
// permite que duas requisições concorrentes leiam o mesmo valor antigo e
// cada uma grave "+1" a partir dele, perdendo um incremento.
async function registerFailedAttempt(userId: string): Promise<void> {
  // Se o bloqueio anterior já expirou, reinicia o contador antes de somar a
  // nova tentativa — sem isso o contador nunca "esfria": uma única senha
  // errada depois do desbloqueio já reativaria os 15 minutos de novo,
  // travando a conta indefinidamente com uma tentativa a cada 15 minutos.
  await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
      failedLoginAttempts: { gte: MAX_ATTEMPTS },
    },
    data: { failedLoginAttempts: 0 },
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });
  if (updated.failedLoginAttempts >= MAX_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
    });
  }
}

const { handlers, signIn, signOut, auth: uncachedAuth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        if (isLockedOut(user)) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await registerFailedAttempt(user.id);
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatarUrl,
        };
      },
    }),
  ],
  callbacks: {
    // Mantém o `session` callback de `authConfig` (copia claims do token pra
    // `session.user`) sem alteração — só o `jwt` é substituído abaixo.
    ...authConfig.callbacks,

    // Sobrescreve (não estende) o `jwt` de `authConfig`: aquele é a versão
    // "Edge-safe" usada pelo middleware (ver comentário em `auth.config.ts`
    // pra explicação de por que a consulta ao banco não pode morar lá). Esta
    // versão, usada por `auth()` em toda Server Component / Route Handler /
    // Server Action do app (nunca pelo middleware), é quem de fato fecha a
    // brecha encontrada pelo Jonas: antes, uma vez logado, o token JWT
    // (`role`/`id`/`avatarUrl`) só era populado no login e depois só
    // repassado como veio por até 8h (`maxAge`), então desativar um usuário
    // ou trocar o cargo dele não tinha nenhum efeito até a sessão expirar ou
    // a pessoa sair sozinha. Agora, toda requisição sem `user` (ou seja,
    // toda requisição pós-login — `user` só vem preenchido no exato momento
    // do login) revalida `active`/`role`/`avatarUrl` direto no banco.
    jwt: async (params) => {
      const { token, user } = params;

      if (user) {
        // Login: mesma lógica de sempre (popula o token a partir do usuário
        // recém-autenticado em `authorize` acima). Delega pro callback base
        // pra não duplicar essa lógica em dois arquivos.
        return authConfig.callbacks.jwt(params);
      }

      const userId = typeof token.id === "string" ? token.id : null;
      if (!userId) {
        // Não deveria acontecer (o token sempre ganha `id` no login, acima),
        // mas sem ele não dá pra revalidar nada — nega por segurança em vez
        // de deixar passar um token sem dono.
        return null;
      }

      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { active: true, role: true, avatarUrl: true },
        });

        if (!dbUser || !dbUser.active) {
          // Usuário excluído ou desativado (`active: false`) depois do
          // login: invalida a sessão. Retornar `null` aqui é o mecanismo
          // nativo do Auth.js pra isso — o `session()` do `@auth/core`
          // (chamado por `auth()` em toda requisição) trata token nulo como
          // "sem sessão": limpa o cookie de sessão e devolve sessão vazia.
          // Como o app inteiro já trata "sem sessão" como "não logado" (é
          // o que `!req.auth` no middleware, `if (!session?.user)` em
          // `getActiveEmpresaContext` etc. já fazem hoje pra usuário
          // deslogado), isso já basta pra forçar login de novo em qualquer
          // página/rota protegida, sem precisar de nenhum campo novo tipo
          // `session.error` nem mudar `middleware.ts`.
          return null;
        }

        // Usuário ainda ativo: atualiza `role`/`avatarUrl` com o valor atual
        // do banco. Como o `session` callback (herdado de `authConfig`)
        // sempre copia esses claims do token pra `session.user`, isso faz
        // toda leitura de `session.user.role` no resto do app (as ~251
        // ocorrências encontradas pelo Jonas) passar a vir sempre fresca,
        // sem precisar tocar em nenhuma dessas rotas.
        token.role = dbUser.role;
        token.avatarUrl = dbUser.avatarUrl;
        return token;
      } catch (error) {
        // Falha ao consultar o banco (ex.: banco fora do ar por um
        // instante): fail-closed — trata como sessão inválida (nega, força
        // novo login) em vez de deixar passar com o cargo/estado antigo do
        // token, ou de propagar a exceção sem controle. `@auth/core` já
        // teria um comportamento parecido se a exceção escapasse daqui (ele
        // limpa o cookie de sessão quando o `jwt` callback lança), mas
        // fazemos isso explicitamente pra não depender desse detalhe
        // interno e pra deixar um log claro de quando isso acontece.
        console.error(
          "[auth] Falha ao revalidar sessão contra o banco — negando por segurança (fail-closed):",
          error
        );
        return null;
      }
    },
  },
});

export { handlers, signIn, signOut };

// `auth()` (usada em ~535 pontos, sem argumento, dentro de Server
// Components/Route Handlers/Server Actions) roda a pipeline inteira do
// Auth.js a cada chamada — incluindo o callback `jwt` acima, que sempre
// faz um `prisma.user.findUnique` pra revalidar `active`/`role`/
// `avatarUrl` (não tem como pular essa consulta: é a correção de
// segurança que fecha a brecha do cargo/desativação "presos" no JWT por
// até 8h, comentário acima). O próprio `next-auth` NÃO envolve `auth` em
// `cache()` do React (conferido lendo `node_modules/next-auth/lib/
// index.js` e `node_modules/next-auth/index.js`: é uma função comum,
// sem memoização), então cada chamada é uma consulta nova — mesmo
// quando várias chamadas de `auth()` acontecem dentro da MESMA
// requisição (ex.: `src/app/portal/layout.tsx` chama `auth()`
// diretamente E através de `getActiveEmpresaContext()`, que chama
// `auth()` de novo internamente; cada `page.tsx` chama `auth()` outra
// vez). Medido ao vivo (achado da auditoria de performance, tarefa
// #285): só isso já gerava entre ~3,6 e ~7,7 consultas repetidas na
// tabela User por carregamento de página, todas com o mesmo resultado
// dentro da mesma requisição.
//
// `cache()` do React deduplica chamadas dentro de UM MESMO ciclo de
// renderização/requisição (documentado em `node_modules/next/dist/docs/
// 01-app/02-guides/caching-without-cache-components.md`, seção
// "Deduplicating requests") — mesmo padrão já usado com sucesso em
// `getActiveEmpresaContext`/`getUserEmpresas` (`src/lib/empresa.ts`).
// Não muda nenhum comportamento de segurança: a revalidação continua
// acontecendo (o callback `jwt` roda normalmente na primeira chamada de
// cada requisição), só para de se repetir à toa dentro da mesma
// requisição — a próxima requisição (próximo carregamento de página)
// sempre dispara uma chamada nova, sem cache entre requisições.
export const auth = cache(uncachedAuth);
