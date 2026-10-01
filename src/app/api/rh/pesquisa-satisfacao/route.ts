import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { computeENPS } from "@/lib/satisfaction";
import { resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";

// Checagem de cargo (MANAGER_ROLES) — mesmo padrão já usado em .../pesquisa-satisfacao/page.tsx e
// em GET /api/satisfaction/surveys (BUG-004/BUG-004b): sem ela, qualquer COLABORADOR com o Perfil
// de Permissão padrão "Funcionário" (rh:canView=true de fábrica) conseguiria chamar este GET
// direto e listar as pesquisas de satisfação e o eNPS geral.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

const LIST_INCLUDE = {
  publico: { include: { empresa: { select: { id: true, name: true } } } },
  perguntas: { select: { id: true } },
  createdBy: { select: { id: true, name: true } },
};

/**
 * Carga da lista de pesquisas já filtrada por período, para .../rh/pesquisa-satisfacao
 * (`pesquisa-satisfacao-client.tsx`) — mesmo padrão `key`/`from`/`to` + `resolveRollingPeriod` de
 * GET /api/estoque/compras. Diferente de GET /api/satisfaction/surveys (usado só para recarregar a
 * lista inteira depois de criar/duplicar/cancelar/excluir uma pesquisa, sem filtro de período),
 * esta rota é dedicada à TELA de listagem: filtra por período e também recalcula o eNPS geral já
 * dentro desse mesmo período. Por isso vive em `/api/rh/` (ao lado das demais rotas "companion de
 * página" do RH, ex. GET /api/rh/finance) em vez de `/api/satisfaction/` (reservado pro CRUD de
 * pesquisa em si, usado também pela tela de criação/edição).
 *
 * O que o período filtra (decisão de produto desta tarefa — ver relatório da task):
 * - Lista/StatCards ("Pesquisas em andamento"/"Total de pesquisas"/"Lojas alcançadas"): a pesquisa
 *   entra quando sua janela `startDate`..`endDate` CRUZA o período selecionado (overlap), não só
 *   quando foi criada dentro dele — uma pesquisa pode ter sido criada num mês e rodado no seguinte.
 * - eNPS geral: recalculado só com as respostas (`SatisfactionResponse.submittedAt`, não
 *   `SatisfactionSurvey.startDate/endDate`) ENVIADAS dentro do período selecionado — é a leitura
 *   "qual o clima da equipe nesse período", mesmo que a pesquisa em si tenha uma janela maior.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver pesquisas de satisfação." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key") as RollingPeriodKey | null;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const periodo = key ? resolveRollingPeriod(key, { from, to }) : null;

  const [surveys, notasEnps] = await Promise.all([
    prisma.satisfactionSurvey.findMany({
      where: {
        publico: { some: { empresaId: { in: empresaIds } } },
        ...(periodo ? { startDate: { lte: periodo.to }, endDate: { gte: periodo.from } } : {}),
      },
      include: LIST_INCLUDE,
      orderBy: { createdAt: "desc" },
    }),
    prisma.satisfactionAnswer.findMany({
      where: {
        question: { tipo: "ENPS" },
        valorNumero: { not: null },
        response: {
          empresaId: { in: empresaIds },
          ...(periodo ? { submittedAt: { gte: periodo.from, lte: periodo.to } } : {}),
        },
      },
      select: { valorNumero: true },
    }),
  ]);

  const enps = computeENPS(notasEnps.map((n) => n.valorNumero!));

  return NextResponse.json({
    surveys,
    enpsGeral: notasEnps.length > 0 ? enps.enps : null,
  });
}
