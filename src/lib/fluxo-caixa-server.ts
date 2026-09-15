import { prisma } from "@/lib/prisma";

export type FluxoCaixaEntry = { valor: number; date: string; empresa: { id: string; name: string }; categoria: string };

export async function computeFluxoCaixa(
  empresaIds: string[],
  from: Date,
  to: Date
): Promise<{ payables: FluxoCaixaEntry[]; receivables: FluxoCaixaEntry[]; saldoInicial: number }> {
  const [payables, receivables, accounts] = await Promise.all([
    prisma.payable.findMany({
      where: {
        empresaId: { in: empresaIds },
        status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
        dataPagamento: { gte: from, lte: to },
      },
      select: {
        valor: true,
        dataPagamento: true,
        empresa: { select: { id: true, name: true } },
        categoria: { select: { name: true } },
      },
    }),
    prisma.receivable.findMany({
      where: {
        empresaId: { in: empresaIds },
        status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
        dataRecebimento: { gte: from, lte: to },
      },
      select: {
        valor: true,
        dataRecebimento: true,
        empresa: { select: { id: true, name: true } },
        categoria: { select: { name: true } },
      },
    }),
    prisma.bankAccount.findMany({ where: { active: true, empresaId: { in: empresaIds } } }),
  ]);

  const saldoInicial = accounts.reduce((a, acc) => a + acc.saldoInicial, 0);

  return {
    payables: payables.map((p) => ({
      valor: p.valor,
      date: p.dataPagamento!.toISOString(),
      empresa: p.empresa,
      categoria: p.categoria.name,
    })),
    receivables: receivables.map((r) => ({
      valor: r.valor,
      date: r.dataRecebimento!.toISOString(),
      empresa: r.empresa,
      categoria: r.categoria.name,
    })),
    saldoInicial,
  };
}
