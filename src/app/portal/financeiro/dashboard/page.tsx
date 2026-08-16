import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { formatCurrency, formatNumber, formatPercent, growth, pct } from "@/lib/calc";
import { computeDre } from "@/lib/dre";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
  subDays,
  addDays,
  format,
} from "date-fns";
import { FinanceCharts } from "./charts";
import { DynamicIcon } from "@/components/dynamic-icon";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getFinancialCategories } from "@/lib/financial-categories";

async function getData() {
  const now = new Date();
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [accounts, payablesOpen, receivablesOpen, dreThisMonth, dreLastMonth, catMap] = await Promise.all([
    prisma.bankAccount.findMany({ where: { active: true, empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
    prisma.payable.findMany({
      where: { status: { in: ["EM_ABERTO", "ATRASADO"] }, empresaId: { in: empresaIds } },
      select: { id: true, fornecedor: true, descricao: true, valor: true, dataVencimento: true },
    }),
    prisma.receivable.findMany({
      where: { status: { in: ["EM_ABERTO", "ATRASADO"] }, empresaId: { in: empresaIds } },
      select: { id: true, valor: true },
    }),
    computeDre({ month: now.getMonth() + 1, year: now.getFullYear(), empresaIds }),
    computeDre({
      month: subMonths(now, 1).getMonth() + 1,
      year: subMonths(now, 1).getFullYear(),
      empresaIds,
    }),
    getFinancialCategories(),
  ]);

  const caixaAtual = accounts.reduce((acc, a) => acc + a.saldoAtual, 0);

  const periods = {
    hoje: { from: startOfDay(now), to: endOfDay(now) },
    semana: { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) },
    mes: { from: startOfMonth(now), to: endOfMonth(now) },
    ano: { from: startOfYear(now), to: endOfYear(now) },
  };

  const [receivablesPaid, payablesPaid] = await Promise.all([
    prisma.receivable.findMany({
      where: {
        status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
        dataCompetencia: { gte: subDays(now, 400) },
        empresaId: { in: empresaIds },
      },
      select: { categoriaId: true, valor: true, dataCompetencia: true },
    }),
    prisma.payable.findMany({
      where: {
        status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
        dataCompetencia: { gte: subDays(now, 400) },
        empresaId: { in: empresaIds },
      },
      select: { categoriaId: true, valor: true, dataCompetencia: true },
    }),
  ]);

  const sumInRange = (arr: { valor: number; dataCompetencia: Date }[], from: Date, to: Date) =>
    arr.filter((e) => e.dataCompetencia >= from && e.dataCompetencia <= to).reduce((a, e) => a + e.valor, 0);

  const faturamentoHoje = sumInRange(receivablesPaid, periods.hoje.from, periods.hoje.to);
  const faturamentoSemana = sumInRange(receivablesPaid, periods.semana.from, periods.semana.to);
  const faturamentoMes = sumInRange(receivablesPaid, periods.mes.from, periods.mes.to);
  const faturamentoAno = sumInRange(receivablesPaid, periods.ano.from, periods.ano.to);
  const faturamentoMesAnterior = sumInRange(
    receivablesPaid,
    startOfMonth(subMonths(now, 1)),
    endOfMonth(subMonths(now, 1))
  );

  const vencidas = payablesOpen.filter((p) => p.dataVencimento < startOfDay(now));
  const vencendoHoje = payablesOpen.filter(
    (p) => p.dataVencimento >= startOfDay(now) && p.dataVencimento <= endOfDay(now)
  );
  const vencendoAmanha = payablesOpen.filter(
    (p) => p.dataVencimento >= startOfDay(addDays(now, 1)) && p.dataVencimento <= endOfDay(addDays(now, 1))
  );
  const vencendoSemana = payablesOpen.filter(
    (p) => p.dataVencimento >= startOfDay(now) && p.dataVencimento <= endOfWeek(now, { weekStartsOn: 1 })
  );
  const totalAPagar = payablesOpen.reduce((a, p) => a + p.valor, 0);
  const totalAReceber = receivablesOpen.reduce((a, r) => a + r.valor, 0);

  const margemLine = dreThisMonth.find((r) => r.key === "margem-contribuicao");
  const lucroOperacional = dreThisMonth.find((r) => r.key === "lucro-operacional");
  const lucroLiquido = dreThisMonth.find((r) => r.key === "lucro-liquido");
  const cmv = dreThisMonth.find((r) => r.key === "cmv");
  const gastosFixos = dreThisMonth.find((r) => r.key === "gastos-fixos");
  const faturamentos = dreThisMonth.find((r) => r.key === "faturamentos");

  const lucroLiquidoAnterior = dreLastMonth.find((r) => r.key === "lucro-liquido");

  // Últimos 14 dias — fluxo diário
  const dailyFlow = [] as { date: string; entradas: number; saidas: number }[];
  for (let i = 13; i >= 0; i--) {
    const day = subDays(now, i);
    const entradas = sumInRange(receivablesPaid, startOfDay(day), endOfDay(day));
    const saidas = sumInRange(payablesPaid, startOfDay(day), endOfDay(day));
    dailyFlow.push({ date: format(day, "dd/MM"), entradas, saidas });
  }

  // despesas/receitas por categoria (mês atual)
  const payablesThisMonth = payablesPaid.filter(
    (p) => p.dataCompetencia >= periods.mes.from && p.dataCompetencia <= periods.mes.to
  );
  const receivablesThisMonth = receivablesPaid.filter(
    (r) => r.dataCompetencia >= periods.mes.from && r.dataCompetencia <= periods.mes.to
  );

  const catNameById = new Map(catMap.map((c) => [c.id, c.name]));

  function groupByCategory(entries: { categoriaId: string; valor: number }[]) {
    const map = new Map<string, number>();
    for (const e of entries) {
      const name = catNameById.get(e.categoriaId) ?? "Outros";
      map.set(name, (map.get(name) ?? 0) + e.valor);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }

  const despesasChart = groupByCategory(payablesThisMonth);
  const receitasChart = groupByCategory(receivablesThisMonth);

  return {
    accounts,
    caixaAtual,
    faturamentoHoje,
    faturamentoSemana,
    faturamentoMes,
    faturamentoAno,
    faturamentoGrowth: growth(faturamentoMes, faturamentoMesAnterior),
    vencidas,
    vencendoHoje,
    vencendoAmanha,
    vencendoSemana,
    totalAPagar,
    totalAReceber,
    margemLine,
    lucroOperacional,
    lucroLiquido,
    lucroLiquidoAnterior,
    cmv,
    gastosFixos,
    faturamentos,
    dailyFlow,
    despesasChart,
    receitasChart,
  };
}

export default async function FinanceiroDashboardPage() {
  const d = await getData();

  return (
    <PageContainer title="Financeiro" subtitle="Dashboard financeiro">
      <div className="space-y-6">

        <SortableStatCards
          storageKey="financeiro-dashboard-kpi-order"
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          cards={[
            { key: "caixa-atual", label: "Caixa atual", value: formatCurrency(d.caixaAtual), icon: "Wallet" },
            { key: "faturamento-dia", label: "Faturamento do dia", value: formatCurrency(d.faturamentoHoje), icon: "Calendar" },
            { key: "faturamento-semana", label: "Faturamento da semana", value: formatCurrency(d.faturamentoSemana), icon: "CalendarDays" },
            { key: "faturamento-mes", label: "Faturamento do mês", value: formatCurrency(d.faturamentoMes), icon: "TrendingUp", delta: d.faturamentoGrowth },
          ]}
        />

        <Section title="Caixa por conta bancária">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {d.accounts.map((a) => (
              <div key={a.id} className="nord-card p-4 flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${a.color}22` }}
                >
                  <DynamicIcon name={a.icon} size={16} style={{ color: a.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-nord-gray truncate">{a.name}</p>
                  <p className="text-white text-sm font-semibold">{formatCurrency(a.saldoAtual)}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <SortableStatCards
          storageKey="financeiro-dashboard-dre-kpi-order"
          className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4"
          cards={[
            { key: "faturamento-ano", label: "Faturamento do ano", value: formatCurrency(d.faturamentoAno), icon: "DollarSign" },
            { key: "margem-contribuicao", label: "Margem de Contribuição", value: formatCurrency(d.margemLine?.value ?? 0), hint: formatPercent(d.margemLine?.percent ?? 0), icon: "PieChart" },
            { key: "lucro-operacional", label: "Lucro Operacional", value: formatCurrency(d.lucroOperacional?.value ?? 0), hint: formatPercent(d.lucroOperacional?.percent ?? 0), icon: "TrendingUp" },
            {
              key: "lucro-liquido",
              label: "Lucro Líquido",
              value: formatCurrency(d.lucroLiquido?.value ?? 0),
              delta: growth(d.lucroLiquido?.value ?? 0, d.lucroLiquidoAnterior?.value ?? 0),
              icon: "BadgeDollarSign",
            },
            { key: "cmv", label: "CMV", value: formatCurrency(d.cmv?.value ?? 0), hint: formatPercent(Math.abs(d.cmv?.percent ?? 0)), icon: "Package", color: "#eab308" },
            { key: "gastos-fixos", label: "Gastos Fixos", value: formatCurrency(d.gastosFixos?.value ?? 0), hint: formatPercent(Math.abs(d.gastosFixos?.percent ?? 0)), icon: "Building2", color: "#ef4444" },
          ]}
        />

        <Section title="Painel de contas">
          <SortableStatCards
            storageKey="financeiro-dashboard-painel-contas-kpi-order"
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4"
            cards={[
              { key: "contas-vencidas", label: "Contas vencidas", value: formatNumber(d.vencidas.length), icon: "AlertTriangle", color: "#ef4444" },
              { key: "vencendo-hoje", label: "Vencendo hoje", value: formatNumber(d.vencendoHoje.length), icon: "Clock", color: "#eab308" },
              { key: "vencendo-amanha", label: "Vencendo amanhã", value: formatNumber(d.vencendoAmanha.length), icon: "Clock" },
              { key: "vencendo-semana", label: "Vencendo na semana", value: formatNumber(d.vencendoSemana.length), icon: "CalendarClock" },
              { key: "total-a-pagar", label: "Total a pagar", value: formatCurrency(d.totalAPagar), icon: "ArrowUpCircle", color: "#ef4444" },
              { key: "total-a-receber", label: "Total a receber", value: formatCurrency(d.totalAReceber), icon: "ArrowDownCircle", color: "#22c55e" },
            ]}
          />
        </Section>

        <FinanceCharts
          dailyFlow={d.dailyFlow}
          despesasChart={d.despesasChart}
          receitasChart={d.receitasChart}
        />

        {d.vencidas.length > 0 && (
          <Section title="Contas vencidas (atenção)">
            <div className="space-y-2">
              {d.vencidas.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-white">{p.fornecedor} — {p.descricao}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-nord-gray">{formatCurrency(p.valor)}</span>
                    <Badge tone="danger">Vencida</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </PageContainer>
  );
}
