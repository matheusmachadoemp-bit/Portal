import { prisma } from "@/lib/prisma";
import { resolvePeriod, resolveSameWeekdayComparison, type PeriodKey } from "@/lib/periods";
import { SALE_CHANNEL_LABEL } from "@/lib/vendas-analytics";
import type { SaleChannel, SalePlatform } from "@prisma/client";

export type FaturamentoParams = {
  key: PeriodKey;
  from?: string;
  to?: string;
  compareMode: "corrido" | "mesmo-dia-semana";
  compareFrom?: string;
  compareTo?: string;
  channel?: SaleChannel;
  platform?: SalePlatform;
};

function dayIndex(date: Date, from: Date) {
  return Math.floor((date.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

const OPENING_HOUR = 18;
const CLOSING_HOUR = 23; // último bloco é 23h30

/** Agrega vendas em blocos de 30 min dentro do horário real de funcionamento (18h às 23h30). */
export function buildHalfHourBuckets(sales: { dateTime: Date; valorTotal: number }[]) {
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const hour = OPENING_HOUR + Math.floor(i / 2);
    const isHalf = i % 2 === 1;
    return { hour, minute: isHalf ? 30 : 0, label: isHalf ? `${hour}h30` : `${hour}h`, faturamento: 0, pedidos: 0 };
  });
  for (const s of sales) {
    const hour = s.dateTime.getHours();
    const minute = s.dateTime.getMinutes();
    if (hour < OPENING_HOUR || hour > CLOSING_HOUR) continue;
    const index = (hour - OPENING_HOUR) * 2 + (minute >= 30 ? 1 : 0);
    if (index < 0 || index >= buckets.length) continue;
    buckets[index].faturamento += s.valorTotal;
    buckets[index].pedidos += 1;
  }
  return buckets;
}

export async function computeFaturamentoSummary(empresaIds: string[], params: FaturamentoParams) {
  const resolved = resolvePeriod(params.key, { from: params.from, to: params.to });
  const periodFrom = resolved.from;
  const periodTo = resolved.to;

  let prevFrom = resolved.prevFrom;
  let prevTo = resolved.prevTo;
  if (params.compareFrom && params.compareTo) {
    prevFrom = new Date(params.compareFrom);
    prevTo = new Date(params.compareTo);
  } else if (params.compareMode === "mesmo-dia-semana") {
    const aligned = resolveSameWeekdayComparison(periodFrom, periodTo);
    prevFrom = aligned.prevFrom;
    prevTo = aligned.prevTo;
  }

  const baseWhere = {
    empresaId: { in: empresaIds },
    cancelado: false,
    ...(params.channel ? { channel: params.channel } : {}),
    ...(params.platform ? { platform: params.platform } : {}),
  };

  const [atualSales, anteriorSales] = await Promise.all([
    prisma.sale.findMany({
      where: { ...baseWhere, dateTime: { gte: periodFrom, lte: periodTo } },
      select: { dateTime: true, valorTotal: true, channel: true },
    }),
    prisma.sale.findMany({
      where: { ...baseWhere, dateTime: { gte: prevFrom, lte: prevTo } },
      select: { dateTime: true, valorTotal: true },
    }),
  ]);

  const faturamentoAtual = atualSales.reduce((sum, s) => sum + s.valorTotal, 0);
  const faturamentoAnterior = anteriorSales.reduce((sum, s) => sum + s.valorTotal, 0);
  const pedidosAtual = atualSales.length;
  const pedidosAnterior = anteriorSales.length;

  const porCanal = new Map<string, number>();
  for (const s of atualSales) porCanal.set(s.channel, (porCanal.get(s.channel) ?? 0) + s.valorTotal);
  let canalLider: { channel: string | null; label: string; percent: number } = { channel: null, label: "—", percent: 0 };
  for (const [ch, valor] of porCanal) {
    const percent = faturamentoAtual ? (valor / faturamentoAtual) * 100 : 0;
    if (percent > canalLider.percent) canalLider = { channel: ch, label: SALE_CHANNEL_LABEL[ch] ?? ch, percent };
  }

  const chartMap = new Map<number, { atual: number; anterior: number }>();
  for (const s of atualSales) {
    const idx = dayIndex(s.dateTime, periodFrom);
    const cur = chartMap.get(idx) ?? { atual: 0, anterior: 0 };
    cur.atual += s.valorTotal;
    chartMap.set(idx, cur);
  }
  for (const s of anteriorSales) {
    const idx = dayIndex(s.dateTime, prevFrom);
    const cur = chartMap.get(idx) ?? { atual: 0, anterior: 0 };
    cur.anterior += s.valorTotal;
    chartMap.set(idx, cur);
  }
  const maxIdx = Math.max(0, dayIndex(periodTo, periodFrom));
  const chartData = Array.from({ length: maxIdx + 1 }, (_, idx) => ({
    dia: idx + 1,
    atual: Math.round(chartMap.get(idx)?.atual ?? 0),
    anterior: Math.round(chartMap.get(idx)?.anterior ?? 0),
  }));

  return {
    kpis: {
      faturamentoAtual,
      faturamentoAnterior,
      pedidosAtual,
      pedidosAnterior,
      ticketMedioAtual: pedidosAtual ? faturamentoAtual / pedidosAtual : 0,
      ticketMedioAnterior: pedidosAnterior ? faturamentoAnterior / pedidosAnterior : 0,
      canalLider,
    },
    chartData,
    from: periodFrom.toISOString(),
    to: periodTo.toISOString(),
    prevFrom: prevFrom.toISOString(),
    prevTo: prevTo.toISOString(),
  };
}
