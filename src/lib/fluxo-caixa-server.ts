import { prisma } from "@/lib/prisma";
import { getFinancialCategories } from "@/lib/financial-categories";
import { splitPayableByCategory } from "@/lib/compra-itens";

export type FluxoCaixaEntry = { valor: number; date: string; empresa: { id: string; name: string }; categoria: string };

export async function computeFluxoCaixa(
  empresaIds: string[],
  from: Date,
  to: Date
): Promise<{ payables: FluxoCaixaEntry[]; receivables: FluxoCaixaEntry[]; saldoInicial: number }> {
  const [payables, receivables, accounts, categorias] = await Promise.all([
    prisma.payable.findMany({
      where: {
        empresaId: { in: empresaIds },
        status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
        dataPagamento: { gte: from, lte: to },
      },
      // `categoriaId` + os itens: ver `splitPayableByCategory` (contas a pagar multicategoria) — um
      // boleto com itens de categorias diferentes vira várias entradas aqui, uma por categoria,
      // somando sempre de volta ao `valor` do boleto.
      select: {
        valor: true,
        dataPagamento: true,
        categoriaId: true,
        empresa: { select: { id: true, name: true } },
        invoice: { select: { items: { select: { categoriaId: true, total: true } } } },
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
    getFinancialCategories(),
  ]);

  const nameByCategoriaId = new Map(categorias.map((c) => [c.id, c.name]));
  const saldoInicial = accounts.reduce((a, acc) => a + acc.saldoInicial, 0);

  return {
    payables: payables.flatMap((p) =>
      splitPayableByCategory(p.valor, p.categoriaId, p.invoice?.items ?? []).map((s) => ({
        valor: s.valor,
        date: p.dataPagamento!.toISOString(),
        empresa: p.empresa,
        categoria: nameByCategoriaId.get(s.categoriaId) ?? "Outros",
      }))
    ),
    receivables: receivables.map((r) => ({
      valor: r.valor,
      date: r.dataRecebimento!.toISOString(),
      empresa: r.empresa,
      categoria: r.categoria.name,
    })),
    saldoInicial,
  };
}
