import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { AccessDenied } from "@/components/ui/access-denied";
import { PontoEletronicoClient } from "./ponto-eletronico-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeTimeEntryTotals, computeTimeEntryMonthlyChart } from "@/lib/ponto-eletronico-server";
import { resolveRollingPeriod } from "@/lib/periods";

// Mesma checagem de cargo (MANAGER_ROLES) já usada pela rota de API irmã (`/api/rh/time-entries`,
// desde o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão
// "Funcionário" (rh:canView=true de fábrica) conseguia ver os registros de ponto de todos os
// colegas direto nesta página Server Component (BUG-004). Fica restrito a
// Administrador/Gestor/Gerente/Supervisor por cargo, igual à API.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function PontoEletronicoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/portal/inicio");
  }
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return (
      <PageContainer title="RH" subtitle="Ponto Eletrônico">
        <AccessDenied message="Esta página reúne os registros de ponto de todos os colaboradores e por isso é restrita a Administrador, Gestor, Gerente ou Supervisor. Se você precisa desse acesso, fale com seu gestor." />
      </PageContainer>
    );
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageRh = await hasModulePermission(session.user.id, "rh", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageRh;

  // Task #282: este findMany não tinha `take` nenhum — buscava TODO o histórico de ponto de
  // todas as lojas do contexto ativo numa carga SSR só, e isso só piora com o tempo (RH gera ~1
  // registro por colaborador por dia, sem fim, igual observado na rota irmã `/api/rh/time-entries`
  // — ver comentário lá). Usamos o mesmo teto SAFETY_TAKE=2000 daquela rota (task #373) por
  // consistência: o `refresh()` do client component (ponto-eletronico-client.tsx) já busca dessa
  // rota sem paginação depois de qualquer criação/edição/exclusão/importação, então a carga inicial
  // já precisa bater com esse mesmo teto — do contrário a tela mudaria de quantidade de registros
  // visíveis (e o gráfico de tendência mensal, que soma sobre todo `entries` independente do
  // período selecionado) só por causa de uma ação do usuário, sem nenhum dado novo de verdade.
  // orderBy date desc garante que o teto sempre corta os registros mais ANTIGOS, nunca os recentes.
  const TIME_ENTRIES_SAFETY_TAKE = 2000;

  // Task #316: os StatCards ("Horas trabalhadas", "Atrasos", "Faltas", "Banco de horas") e os
  // gráficos "por mês" NÃO podem vir da lista `entries` acima — ela tem `take`, e somar/contar uma
  // lista cortada dá um número ERRADO (silenciosamente menor que o real) assim que o histórico da
  // loja passa do teto. `computeTimeEntryTotals`/`computeTimeEntryMonthlyChart` (ver
  // src/lib/ponto-eletronico-server.ts pro racional completo) calculam isso via agregação no banco,
  // sem `take` nenhum. Os StatCards respeitam o período selecionado na tela — "mes-atual" é o
  // período inicial do client component (`ponto-eletronico-client.tsx`), então a carga SSR usa o
  // mesmo período pra bater com o que a tela mostra antes de qualquer interação do usuário; trocar
  // de período depois dispara uma busca nova em `/api/rh/time-entries/totals`. Os gráficos "por mês"
  // nunca são filtrados por período, de propósito (ver racional em `computeTimeEntryMonthlyChart`).
  const initialRange = resolveRollingPeriod("mes-atual");
  const timeEntryWhere = { empresaId: { in: empresaIds }, date: { gte: initialRange.from, lte: initialRange.to } };

  const [entries, employees, initialTotals, initialChartData] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { date: "desc" },
      include: { employee: { select: { name: true, setor: true } } },
      take: TIME_ENTRIES_SAFETY_TAKE,
    }),
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, setor: true },
    }),
    computeTimeEntryTotals(timeEntryWhere),
    computeTimeEntryMonthlyChart(empresaIds),
  ]);

  const serialized = entries.map((e) => ({ ...e, date: e.date.toISOString() }));

  return (
    <PageContainer title="RH" subtitle="Ponto Eletrônico">
      <PontoEletronicoClient
        initialEntries={serialized}
        initialTotals={initialTotals}
        initialChartData={initialChartData}
        employees={employees}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
