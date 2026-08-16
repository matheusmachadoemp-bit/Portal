import { prisma } from "@/lib/prisma";
import { getTurno, SALE_TYPE_LABEL, SALE_TYPE_ORDER, type SaleType, type Turno } from "@/lib/vendas-analytics";
import type { SalePlatform } from "@prisma/client";

function classify(sale: { channel: string; cancelado: boolean }): SaleType {
  if (sale.cancelado) return "CANCELADO";
  if (sale.channel === "DELIVERY") return "ENTREGA";
  if (sale.channel === "BALCAO") return "BALCAO";
  return "SALAO";
}

export type AcompanhamentoParams = {
  fromA: string;
  toA: string;
  fromB: string;
  toB: string;
  turno?: Turno;
  platform?: SalePlatform;
};

function summarize(sales: { valorTotal: number }[]) {
  const valor = sales.reduce((sum, s) => sum + s.valorTotal, 0);
  const pedidos = sales.length;
  return { valor, pedidos, ticketMedio: pedidos ? valor / pedidos : 0 };
}

export async function computeAcompanhamento(empresaIds: string[], params: AcompanhamentoParams) {
  const fromA = new Date(params.fromA);
  const toA = new Date(params.toA);
  const fromB = new Date(params.fromB);
  const toB = new Date(params.toB);

  const [salesA, salesB] = await Promise.all([
    prisma.sale.findMany({
      where: {
        empresaId: { in: empresaIds },
        dateTime: { gte: fromA, lte: toA },
        ...(params.platform ? { platform: params.platform } : {}),
      },
      select: { dateTime: true, channel: true, cancelado: true, valorTotal: true },
    }),
    prisma.sale.findMany({
      where: {
        empresaId: { in: empresaIds },
        dateTime: { gte: fromB, lte: toB },
        ...(params.platform ? { platform: params.platform } : {}),
      },
      select: { dateTime: true, channel: true, cancelado: true, valorTotal: true },
    }),
  ]);

  const filterTurno = (sales: typeof salesA) => (params.turno ? sales.filter((s) => getTurno(s.dateTime) === params.turno) : sales);
  const a = filterTurno(salesA);
  const b = filterTurno(salesB);

  const kpisA = summarize(a);
  const kpisB = summarize(b);

  const byType = SALE_TYPE_ORDER.map((type) => {
    const groupA = summarize(a.filter((s) => classify(s) === type));
    const groupB = summarize(b.filter((s) => classify(s) === type));
    return { type, label: SALE_TYPE_LABEL[type], pedidosA: groupA.pedidos, pedidosB: groupB.pedidos, valorA: groupA.valor, valorB: groupB.valor, ticketA: groupA.ticketMedio, ticketB: groupB.ticketMedio };
  });

  return {
    kpis: {
      faturamentoA: kpisA.valor,
      faturamentoB: kpisB.valor,
      pedidosA: kpisA.pedidos,
      pedidosB: kpisB.pedidos,
      ticketMedioA: kpisA.ticketMedio,
      ticketMedioB: kpisB.ticketMedio,
    },
    byType,
  };
}
