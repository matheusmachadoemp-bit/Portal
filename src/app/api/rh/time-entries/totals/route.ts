import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { computeTimeEntryTotals, computeTimeEntryMonthlyChart } from "@/lib/ponto-eletronico-server";

// Mesma checagem de cargo (MANAGER_ROLES) já usada pela rota irmã `/api/rh/time-entries` (BUG-004b)
// — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão "Funcionário" (rh:canView=true
// de fábrica) conseguia chamar este GET direto e ver os totais de ponto de todos os colegas.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

/**
 * Task #316: totais dos StatCards ("Horas trabalhadas", "Atrasos", "Faltas", "Banco de horas") e
 * dados dos gráficos "por mês" de `ponto-eletronico-client.tsx`, calculados via agregação no banco
 * (ver racional completo em src/lib/ponto-eletronico-server.ts) — nunca somando/contando a lista de
 * `entries` de `/api/rh/time-entries`, que tem `take:2000`.
 *
 * Endpoint próprio (em vez de acrescentar `totals`/`chartData` na resposta de
 * `/api/rh/time-entries`) de propósito: a tabela da tela continua buscando de
 * `/api/rh/time-entries` do jeito de sempre (sem filtro de período no servidor — o período da tela
 * escopa a TABELA no cliente, sobre a lista já carregada, comportamento inalterado por esta task).
 * Os StatCards, diferente da tabela, precisam refletir o período selecionado com uma consulta
 * própria sem `take` — buscar de novo os até 2000 registros de `entries` só para descartá-los a
 * cada troca de período seria desperdício; este endpoint devolve só os números, nunca a lista.
 *
 * `from`/`to` (ISO) filtram os StatCards pelo período selecionado na tela — mesmo `where` usado
 * pela rota irmã. Omitir os dois (ex.: período "Personalizado" com datas ainda incompletas — não
 * deveria acontecer de fato, já que o botão "Aplicar" do filtro fica desabilitado até preencher as
 * duas, mas a rota trata o caso mesmo assim) resulta em StatCards sem filtro de data (todo o
 * histórico). `chartData` (gráficos "por mês") nunca é filtrado por `from`/`to`, de propósito (ver
 * racional em `computeTimeEntryMonthlyChart`).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o RH." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const empresaIds = empresaIdsForContext(ctx);
  const where = {
    empresaId: { in: empresaIds },
    ...(employeeId ? { employeeId } : {}),
    ...(from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
  };

  const [totals, chartData] = await Promise.all([
    computeTimeEntryTotals(where),
    computeTimeEntryMonthlyChart(empresaIds, employeeId),
  ]);

  return NextResponse.json({ totals, chartData });
}
