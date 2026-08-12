import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { StatCard, Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { formatCurrency, formatNumber, formatPercent, growth, pct, safeDiv } from "@/lib/calc";
import { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DashboardCharts } from "./charts";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import type { Empresa } from "@prisma/client";

async function getData(empresaIds: string[]) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevMonthStart = startOfMonth(subMonths(now, 1));
  const prevMonthEnd = endOfMonth(subMonths(now, 1));
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [thisMonth, prevMonth, today, occurrences, marketing, goals] = await Promise.all([
    prisma.salesEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: monthStart, lte: monthEnd } } }),
    prisma.salesEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: prevMonthStart, lte: prevMonthEnd } } }),
    prisma.salesEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: todayStart, lte: todayEnd } } }),
    prisma.occurrence.findMany({
      where: { date: { gte: monthStart, lte: monthEnd }, employee: { empresaId: { in: empresaIds } } },
    }),
    prisma.marketingEntry.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { date: "desc" }, take: 1 }),
    prisma.goal.findMany({
      where: { empresaId: { in: empresaIds }, endDate: { gte: now } },
      orderBy: { endDate: "asc" },
      take: 5,
    }),
  ]);

  const sum = (arr: typeof thisMonth, key: keyof (typeof thisMonth)[number]) =>
    arr.reduce((acc, e) => acc + (Number(e[key]) || 0), 0);

  const fatMes = sum(thisMonth, "faturamentoDelivery") + sum(thisMonth, "faturamentoSalao");
  const fatMesAnterior = sum(prevMonth, "faturamentoDelivery") + sum(prevMonth, "faturamentoSalao");
  const fatHoje = sum(today, "faturamentoDelivery") + sum(today, "faturamentoSalao");

  const pedidosMes =
    sum(thisMonth, "pedidosDelivery") + sum(thisMonth, "pedidosBalcao") + sum(thisMonth, "pedidosSalao");
  const pedidosMesAnterior =
    sum(prevMonth, "pedidosDelivery") + sum(prevMonth, "pedidosBalcao") + sum(prevMonth, "pedidosSalao");

  const metaMensal = thisMonth.reduce((acc, e) => acc + e.metaDiaria, 0) || 130000;
  const ticketMedio = safeDiv(fatMes, pedidosMes);
  const fatDelivery = sum(thisMonth, "faturamentoDelivery");
  const fatSalao = sum(thisMonth, "faturamentoSalao");
  const taxaServico = sum(thisMonth, "taxaServicoValor");
  const taxaServicoPct = pct(taxaServico, fatSalao);

  const faltas = occurrences.filter((o) => o.type === "FALTA").length;
  const atrasos = occurrences.filter((o) => o.type === "ATRASO").length;

  const mkt = marketing[0];
  const roas = mkt ? safeDiv(mkt.receitaTrafego, mkt.investimentoTrafego) : 0;

  const dailySeries = thisMonth
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((e) => ({
      date: format(e.date, "dd/MM"),
      total: e.faturamentoDelivery + e.faturamentoSalao,
      delivery: e.faturamentoDelivery,
      salao: e.faturamentoSalao,
    }));

  const channelData = [
    { name: "Delivery", value: fatDelivery },
    { name: "Salão", value: fatSalao },
  ];

  const monthlyRanges = Array.from({ length: 6 }, (_, idx) => {
    const i = 5 - idx;
    return { start: startOfMonth(subMonths(now, i)), end: endOfMonth(subMonths(now, i)) };
  });
  const monthlyEvolution = await Promise.all(
    monthlyRanges.map(async ({ start, end }) => {
      const entries = await prisma.salesEntry.findMany({
        where: { empresaId: { in: empresaIds }, date: { gte: start, lte: end } },
        select: { faturamentoDelivery: true, faturamentoSalao: true },
      });
      const total = entries.reduce((acc, e) => acc + e.faturamentoDelivery + e.faturamentoSalao, 0);
      return { month: format(start, "MMM", { locale: ptBR }), total };
    })
  );

  return {
    fatMes,
    fatMesAnterior,
    fatHoje,
    pedidosMes,
    metaMensal,
    ticketMedio,
    fatDelivery,
    fatSalao,
    taxaServicoPct,
    faltas,
    atrasos,
    roas,
    goals,
    dailySeries,
    channelData,
    monthlyEvolution,
    pedidosGrowth: growth(pedidosMes, pedidosMesAnterior),
  };
}

async function getComparisonRow(empresa: Empresa) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [thisMonth, occurrences] = await Promise.all([
    prisma.salesEntry.findMany({ where: { empresaId: empresa.id, date: { gte: monthStart, lte: monthEnd } } }),
    prisma.occurrence.findMany({
      where: { date: { gte: monthStart, lte: monthEnd }, employee: { empresaId: empresa.id } },
    }),
  ]);

  const fatMes = thisMonth.reduce((a, e) => a + e.faturamentoDelivery + e.faturamentoSalao, 0);
  const pedidosMes = thisMonth.reduce((a, e) => a + e.pedidosDelivery + e.pedidosBalcao + e.pedidosSalao, 0);
  const metaMensal = thisMonth.reduce((a, e) => a + e.metaDiaria, 0) || 0;

  return {
    empresa,
    fatMes,
    pedidosMes,
    ticketMedio: safeDiv(fatMes, pedidosMes),
    metaMensal,
    percentualMeta: pct(fatMes, metaMensal),
    faltas: occurrences.filter((o) => o.type === "FALTA").length,
  };
}

export default async function InicioPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const d = await getData(empresaIds);
  const percentualMeta = pct(d.fatMes, d.metaMensal);
  const abaixoDaMeta = percentualMeta < 70;
  const subtitle =
    ctx?.mode === "single" ? `Visão geral da ${ctx.empresa.name}` : "Visão geral consolidada — Grupo Nord";

  const comparison = ctx?.mode === "grupo" ? await Promise.all(ctx.empresas.map(getComparisonRow)) : null;

  return (
    <PageContainer title="Início" subtitle={subtitle}>
      {abaixoDaMeta && (
        <div className="nord-card p-4 flex items-center gap-3 border-amber-600/40 bg-amber-950/10">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200">
            O faturamento do mês está em {formatPercent(percentualMeta)} da meta. Atenção aos
            indicadores de vendas para os próximos dias.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Faturamento do mês"
          value={formatCurrency(d.fatMes)}
          icon="DollarSign"
          delta={growth(d.fatMes, d.fatMesAnterior)}
        />
        <StatCard label="Faturamento do dia" value={formatCurrency(d.fatHoje)} icon="Calendar" />
        <StatCard label="Meta mensal" value={formatCurrency(d.metaMensal)} icon="Target" />
        <StatCard
          label="% da meta atingida"
          value={formatPercent(percentualMeta)}
          icon="TrendingUp"
          color={abaixoDaMeta ? "#ef4444" : "#22c55e"}
        />
        <StatCard label="Ticket médio" value={formatCurrency(d.ticketMedio)} icon="Receipt" />
        <StatCard
          label="Pedidos realizados"
          value={formatNumber(d.pedidosMes)}
          icon="ShoppingBag"
          delta={d.pedidosGrowth}
        />
        <StatCard label="Faturamento salão" value={formatCurrency(d.fatSalao)} icon="Utensils" />
        <StatCard label="Faturamento delivery" value={formatCurrency(d.fatDelivery)} icon="Bike" />
        <StatCard label="Taxa de serviço" value={formatPercent(d.taxaServicoPct)} icon="Percent" />
        <StatCard label="Faltas no mês" value={formatNumber(d.faltas)} icon="UserX" color="#ef4444" />
        <StatCard label="Atrasos no mês" value={formatNumber(d.atrasos)} icon="Clock" color="#eab308" />
        <StatCard
          label="ROAS tráfego pago"
          value={`${formatNumber(d.roas, 2)}x`}
          icon="Rocket"
          color="#a855f7"
        />
      </div>

      {comparison && (
        <Section title="Comparativo entre lojas — mês atual">
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 pr-4">Loja</th>
                  <th className="py-2 pr-4">Faturamento</th>
                  <th className="py-2 pr-4">Pedidos</th>
                  <th className="py-2 pr-4">Ticket médio</th>
                  <th className="py-2 pr-4">Meta mensal</th>
                  <th className="py-2 pr-4">% da meta</th>
                  <th className="py-2 pr-4">Faltas</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((c) => (
                  <tr key={c.empresa.id} className="border-b border-nord-border/50 hover:bg-white/5">
                    <td className="py-2.5 pr-4 text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.empresa.color }} />
                      {c.empresa.name}
                    </td>
                    <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(c.fatMes)}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{formatNumber(c.pedidosMes)}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(c.ticketMedio)}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(c.metaMensal)}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={c.percentualMeta < 70 ? "danger" : c.percentualMeta < 100 ? "warning" : "success"}>
                        {formatPercent(c.percentualMeta)}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-nord-gray">{formatNumber(c.faltas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <DashboardCharts
        dailySeries={d.dailySeries}
        channelData={d.channelData}
        monthlyEvolution={d.monthlyEvolution}
      />

      <Section
        title="Metas próximas do vencimento"
        action={
          <Link href="/portal/metas/gerencia" className="text-xs text-nord-blue-light flex items-center gap-1 hover:underline">
            Ver todas <ArrowRight size={12} />
          </Link>
        }
      >
        <div className="space-y-3">
          {d.goals.length === 0 && <p className="text-sm text-nord-gray">Nenhuma meta em aberto.</p>}
          {d.goals.map((g) => {
            const percent = pct(g.valorRealizado, g.valorMeta);
            return (
              <div key={g.id} className="flex items-center gap-4">
                <div className="w-40 shrink-0">
                  <p className="text-sm text-white truncate">{g.name}</p>
                  <p className="text-xs text-nord-gray">{g.responsavel}</p>
                </div>
                <div className="flex-1">
                  <ProgressBar percent={percent} />
                </div>
                <span className="text-xs text-nord-gray w-14 text-right">{formatPercent(percent)}</span>
                <Badge
                  tone={
                    g.status === "CONCLUIDA"
                      ? "success"
                      : g.status === "EM_RISCO" || g.status === "NAO_ATINGIDA"
                      ? "danger"
                      : "info"
                  }
                >
                  {g.status.replaceAll("_", " ")}
                </Badge>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Lançar vendas do dia", href: "/portal/vendas", icon: "ShoppingCart" },
          { label: "Cadastrar meta", href: "/portal/metas/gerencia", icon: "Target" },
          { label: "Registrar ocorrência RH", href: "/portal/rh/ocorrencias", icon: "AlertTriangle" },
          { label: "Atualizar ficha técnica", href: "/portal/ficha-tecnica/pizzas-salgadas", icon: "ClipboardList" },
        ].map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="nord-card p-4 flex items-center gap-3 hover:border-nord-blue transition group"
          >
            <div className="w-9 h-9 rounded-lg bg-nord-blue/15 flex items-center justify-center text-nord-blue-light">
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
            </div>
            <span className="text-sm text-white">{s.label}</span>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
