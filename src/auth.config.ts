import type { NextAuthConfig } from "next-auth";

// Este arquivo é a config "enxuta" usada pelo `middleware.ts` (Edge Runtime —
// ver comentário lá em cima do arquivo), então NUNCA pode importar nada que
// dependa de módulos nativos do Node (Prisma com adapter-pg, bcrypt etc.):
// isso já foi tentado e quebra a aplicação inteira (toda requisição passa
// pelo middleware, então um import incompatível aqui derruba o app inteiro,
// não só uma rota) — o erro observado ao testar foi
// "Failed to load external module node:util/types: TypeError: Native module
// not found", porque o driver `pg` do Prisma usa `net`/`tls`, que não
// existem no Edge Runtime. Por isso a revalidação de `active`/`role` contra
// o banco (ver `src/auth.ts`) SÓ pode acontecer lá, nunca aqui — este
// arquivo continua só decodificando/repassando o que já está no token.
//
// Isso é seguro porque `middleware.ts` só faz uma checagem "otimista"
// (existe uma sessão assinada válida? ver `!req.auth` em `middleware.ts`) —
// a checagem "de verdade" (usuário ainda ativo? cargo mudou?) acontece toda
// vez que uma Server Component / Route Handler / Server Action chama
// `auth()` de `@/auth` (nunca de `@/auth.config` diretamente), o que já
// acontece em praticamente toda página do portal (ver `getActiveEmpresaContext`
// em `@/lib/empresa.ts`) e em toda rota de API que faz alguma checagem de
// permissão — segue a própria recomendação do Next.js pra Proxy/Middleware:
// "it should not be used as a full session management or authorization
// solution [...] avoid database checks to prevent performance issues";
// checagens "de verdade" devem ficar o mais perto possível da fonte de
// dados (node_modules/next/dist/docs/01-app/02-guides/authentication.md).
export const authConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = user.id as string;
        token.avatarUrl = (user as { avatarUrl: string | null }).avatarUrl;
        // Só populado neste ramo (login de verdade, `user` vem de
        // `authorize()`). No caminho de revalidação (`user` undefined, ver
        // `src/auth.ts`), este campo simplesmente não é tocado — o valor já
        // presente no token (decodificado do JWT existente) segue adiante
        // sem mudança, então uma vez `true` no login, permanece `true` pelo
        // resto da sessão (até 8h); nunca é setado como `true` de novo numa
        // sessão que já começou com `false`, já que só é escrito aqui.
        token.isFirstLogin = (user as { isFirstLogin: boolean }).isFirstLogin;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        (session.user as typeof session.user & { role: string; id: string; avatarUrl: string | null }).role =
          token.role as string;
        (session.user as typeof session.user & { role: string; id: string; avatarUrl: string | null }).id =
          token.id as string;
        (session.user as typeof session.user & { role: string; id: string; avatarUrl: string | null }).avatarUrl =
          (token.avatarUrl as string | null) ?? null;
        (session.user as typeof session.user & { isFirstLogin: boolean }).isFirstLogin =
          (token.isFirstLogin as boolean | undefined) ?? false;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
