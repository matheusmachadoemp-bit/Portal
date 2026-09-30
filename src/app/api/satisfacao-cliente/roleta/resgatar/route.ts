import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { resgatarPremio } from "@/lib/roulette-server";

/**
 * Resgata um prêmio da Roleta pelo código digitado por um funcionário (garçom, caixa, gerente —
 * quem estiver operando o resgate na loja) — Fase 7. Decisão de produto #9 (já validada com o
 * Matheus, ver Torre de Controle): resgate só por código DIGITADO, sem leitura de câmera/QR por
 * enquanto — esta rota não tem (nem deve ganhar nesta fase) nenhuma entrada alternativa por
 * imagem/QR. A tela que chama esta rota é a Fase 7-UI, ainda não construída (fora de escopo aqui).
 *
 * Gate de permissão: módulo "satisfacao-cliente", subcategoria "roleta" (mesma subcategoria do
 * CRUD admin de prêmios, `GET/POST/PATCH/DELETE .../roleta/premios`), ação `canExecute` — não
 * `canEdit`. Resgatar não cria/edita/exclui nenhuma configuração do catálogo de prêmios, só
 * executa uma ação operacional do dia a dia sobre um giro que já existe — mesmo racional já
 * documentado em `POST .../avaliacoes/[id]/assumir` ("ação operacional" vs. "edição de config") e
 * na própria definição do nível EXECUTAR em `ACCESS_LEVEL_TO_MODULE_FLAGS`
 * (src/lib/permissions.ts): "além de ver, pode rodar a ação operacional do módulo sem poder criar/
 * editar/excluir a configuração por trás dela".
 *
 * Efeito prático dessa escolha: Administrador/Gestor/Gerente/Supervisor conseguem resgatar (herdado
 * do nível EDITAR/TOTAL da chave do módulo inteiro "satisfacao-cliente", que já inclui canExecute —
 * nenhuma linha própria precisa pra eles). Funcionário e Líder (decisão do Matheus, depois da
 * revisão do Teulis: "líder e caixa" — "caixa" mapeado pra "funcionario", não existe perfil "Caixa"
 * separado no catálogo) TAMBÉM conseguem, mas via uma linha própria restrita a esta subcategoria
 * ("satisfacao-cliente:roleta", só com canExecute — não canCreate/canEdit/canDelete, pra não abrir o
 * CRUD do catálogo de prêmios pra eles) — ver bloco "Satisfação do Cliente > Roleta de Prêmios >
 * resgate" em `prisma/seed.ts` e a migration de backfill
 * `prisma/migrations/20260930120000_satisfacao_cliente_roleta_resgate_permissao`. Marketing/
 * Financeiro continuam sem canExecute (sem linha própria — herdam VISUALIZAR da chave do módulo
 * inteiro, sem mudança). Quem quiser afinar isso por loja/usuário específico ainda pode, via a tela
 * de Permissões (override por usuário) — este é só o padrão de fábrica.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canExecute", "roleta"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite resgatar prêmios da Roleta." },
      { status: 403 }
    );
  }

  // Loja ATIVA de quem está operando o resgate — nunca um id vindo do corpo da requisição (mesmo
  // padrão de `GET/POST/PATCH/DELETE .../roleta/premios`). `requireActiveSingleEmpresa` já garante
  // que é uma loja que este usuário tem acesso (ver `getActiveEmpresaContext`), então não é preciso
  // nenhuma checagem adicional de posse aqui.
  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível resgatar prêmios da Roleta no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);

  const resultado = await resgatarPremio({
    codigoDigitado: body?.codigo,
    empresaId: empresa.id,
    resgatadoPorId: session.user.id,
    resgatadoPorNome: session.user.name ?? null,
  });

  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: resultado.status });

  return NextResponse.json({ ok: true, spin: resultado.spin });
}
