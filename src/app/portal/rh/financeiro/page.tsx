import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { AccessDenied } from "@/components/ui/access-denied";
import { FinanceiroClient } from "./financeiro-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeFinanceMonthlyChart, computeFinanceTotals } from "@/lib/rh-server";

// Mesma checagem de cargo (MANAGER_ROLES) já usada pela rota de API irmã (`/api/rh/finance`, desde
// o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão "Funcionário"
// (rh:canView=true de fábrica) conseguia ver todos os lançamentos financeiros (vale/adiantamento/
// desconto) de todos os colegas direto nesta página Server Component (BUG-004). Fica restrito a
// Administrador/Gestor/Gerente/Supervisor por cargo, igual à API.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function FinanceiroPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/portal/inicio");
  }
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return (
      <PageContainer title="RH" subtitle="Financeiro">
        <AccessDenied message="Esta página reúne os lançamentos financeiros (vale, adiantamento, desconto) de todos os colaboradores e por isso é restrita a Administrador, Gestor, Gerente ou Supervisor. Se você precisa desse acesso, fale com seu gestor." />
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

  // Task #309 (achado meu mesmo no #287, mesma classe do #282): este findMany não tinha `take`
  // nenhum, carregando o histórico financeiro COMPLETO de TODOS os colaboradores da loja (ou de
  // todas as lojas, no modo Grupo Nord consolidado — `empresaIds` vem de `empresaIdsForContext`,
  // que devolve todas as lojas nesse modo). Diferente do #287 (ficha de 1 colaborador só, filtrada
  // por `employeeId`), aqui o volume multiplica pelo número de colaboradores.
  //
  // Conta (não há no repo um número documentado de colaboradores/loja nem de lojas do Grupo Nord,
  // então uso estimativas de trabalho conservadoras, deixadas explícitas aqui pra quem revisar
  // poder discordar com números melhores):
  // - Loja típica: ~40 colaboradores ATIVOS ao mesmo tempo (cozinha + salão + entrega + supervisão).
  // - `Employee` nunca é apagado ao desligar (só `status` vira DESLIGADO — ver schema.prisma), e
  //   esta query não filtra por status — então o total de colaboradores que entra na conta cresce
  //   com o turnover ao longo da vida da loja, não só com o quadro atual. Turnover alto é comum em
  //   food service; assumindo ~3x o quadro atual ao longo dos anos, ~120 colaboradores "históricos"
  //   por loja madura.
  // - Grupo Nord consolidado (modo "grupo"): número de lojas não documentado no repo, uso 8 como
  //   estimativa de trabalho ≈ 960 colaboradores históricos no total (arredondo pra ~1000).
  //
  // Financeiro é o pior caso dos 5 recursos porque cresce com o TEMPO (não só com o quadro
  // histórico): só a folha recorrente (salário+VT+VA) já dá ~3 lançamentos/mês por colaborador
  // ATIVO, e bônus/comissão/desconto pontuais somam mais — uso ~7/mês como média. Com ~320
  // colaboradores ativos (~40 × 8 lojas) isso é ~2200 lançamentos NOVOS por mês no Grupo Nord
  // consolidado, que se acumulam pra sempre — mesma classe "cresce sem parar" do Ponto Eletrônico
  // (#282/#373), só que mais devagar (financeiro é mensal, ponto é ~diário).
  //
  // Por isso o teto aqui precisa ser maior que o individual da ficha (FINANCE_ENTRIES_SAFETY_TAKE
  // =2000, ver colaboradores/[id]/page.tsx) mas ainda contido pra continuar uma consulta rápida.
  // Uso 5000 (2,5x o individual) — mesma lógica de "remendo temporário" já aceita pro Ponto
  // Eletrônico: não resolve o crescimento de raiz (a correção completa é paginação na tela, fora do
  // escopo aqui), mas reduz bastante a chance de estourar no uso atual. `/api/rh/finance` (chamada
  // pelo refresh() do client component) usa o mesmo valor, pra manter a carga inicial (SSR) e o
  // refresh consistentes — ver comentário lá.
  const FINANCE_ENTRIES_STORE_SAFETY_TAKE = 5000;

  // Task #309 revisão (Teulis): os StatCards ("Total recebido", "Salário" etc.) e o gráfico
  // "Evolução dos recebimentos" NÃO podem vir da lista `entries` acima — ela agora tem `take`, e
  // somar/agrupar uma lista cortada nos dá um total ERRADO (silenciosamente menor que o real) assim
  // que o histórico da loja passa do teto. `computeFinanceTotals`/`computeFinanceMonthlyChart` (ver
  // src/lib/rh-server.ts pro racional completo) calculam isso via agregação no banco, sem `take`
  // nenhum — sempre corretos, e ainda baratos (a resposta tem no máximo ~7 linhas de totais + 1
  // linha por mês com movimento, nunca 1 linha por lançamento).
  const financeWhere = { empresaId: { in: empresaIds } };
  const [entries, employees, totals, chartData] = await Promise.all([
    prisma.employeeFinanceEntry.findMany({
      where: financeWhere,
      orderBy: { date: "desc" },
      include: { employee: { select: { name: true, setor: true } } },
      take: FINANCE_ENTRIES_STORE_SAFETY_TAKE,
    }),
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, setor: true },
    }),
    computeFinanceTotals(financeWhere),
    computeFinanceMonthlyChart(empresaIds),
  ]);

  const serialized = entries.map((e) => ({ ...e, date: e.date.toISOString() }));

  return (
    <PageContainer title="RH" subtitle="Financeiro">
      <FinanceiroClient
        initialEntries={serialized}
        initialTotals={totals}
        initialChartData={chartData}
        employees={employees}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
