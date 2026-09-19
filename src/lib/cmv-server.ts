import { prisma } from "@/lib/prisma";
import {
  breakdownMovimentacoesNoPeriodo,
  cmvRealValor,
  snapshotEstoqueEm,
  valorEstoqueDeSnapshot,
  cmvTeoricoPercentCatalogo,
} from "@/lib/cmv";
import { productTotalCost, cmvPercent, PRODUCT_CATEGORY_LABEL } from "@/lib/ficha";

export async function computeCmvReal(empresaIds: string[], from: Date, to: Date) {
  const [ingredients, snapshotInicial, snapshotFinal, movements, salesEntries] = await Promise.all([
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } } }),
    snapshotEstoqueEm(prisma, empresaIds, from),
    snapshotEstoqueEm(prisma, empresaIds, to),
    // breakdownMovimentacoesNoPeriodo só soma o que cai dentro de [from, to]
    // (mesmo filtro que ela já aplicava em JS) — trazer só essa janela do
    // banco não muda o resultado, só evita carregar o histórico inteiro.
    prisma.stockMovement.findMany({
      where: { empresaId: { in: empresaIds }, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.salesEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: from, lte: to } } }),
  ]);

  const estoqueInicial = valorEstoqueDeSnapshot(ingredients, snapshotInicial);
  const estoqueFinal = valorEstoqueDeSnapshot(ingredients, snapshotFinal);
  const breakdown = breakdownMovimentacoesNoPeriodo(ingredients, movements, from, to);
  const compras = breakdown.compras;
  const custoConsumido = cmvRealValor(
    estoqueInicial + breakdown.transferenciasRecebidas,
    compras - breakdown.transferenciasEnviadas - breakdown.devolucoes + breakdown.ajustes,
    estoqueFinal
  );

  const faturamentoDelivery = salesEntries.reduce((s, e) => s + e.faturamentoDelivery, 0);
  const faturamentoSalao = salesEntries.reduce((s, e) => s + e.faturamentoSalao, 0);

  return {
    estoqueInicial,
    compras,
    transferenciasRecebidas: breakdown.transferenciasRecebidas,
    transferenciasEnviadas: breakdown.transferenciasEnviadas,
    devolucoes: breakdown.devolucoes,
    ajustes: breakdown.ajustes,
    perdas: breakdown.perdas,
    estoqueFinal,
    custoConsumido,
    faturamentoDelivery,
    faturamentoSalao,
  };
}

export async function computeCmvTeorico(empresaIds: string[], from: Date, to: Date, metaCmvPercent: number) {
  const [products, salesEntries] = await Promise.all([
    prisma.product.findMany({ where: { empresaId: { in: empresaIds } }, include: { ingredients: { include: { ingredient: true } } } }),
    prisma.salesEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: from, lte: to } } }),
  ]);

  const productsWithCost = products.map((p) => ({ ...p, totalCost: productTotalCost(p.ingredients) }));
  const cmvTeoricoPercent = cmvTeoricoPercentCatalogo(productsWithCost);
  const faturamentoPeriodo = salesEntries.reduce((s, e) => s + e.faturamentoDelivery + e.faturamentoSalao, 0);
  const custoTeoricoTotal = (cmvTeoricoPercent / 100) * faturamentoPeriodo;

  const categoriaChart = Object.entries(PRODUCT_CATEGORY_LABEL)
    .map(([key, label]) => {
      const items = productsWithCost.filter((p) => p.category === key && p.precoVenda > 0);
      return { name: label, value: Math.round(cmvTeoricoPercentCatalogo(items) * 10) / 10, produtos: items.length };
    })
    .filter((c) => c.produtos > 0);

  const produtosMaiorImpacto = productsWithCost
    .filter((p) => p.precoVenda > 0)
    .map((p) => ({ id: p.id, name: p.name, cmv: cmvPercent(p.totalCost, p.precoVenda), custo: p.totalCost, precoVenda: p.precoVenda }))
    .filter((p) => p.cmv > metaCmvPercent)
    .sort((a, b) => b.cmv - a.cmv);

  const produtosSemFicha = products.filter((p) => p.ingredients.length === 0).map((p) => ({ id: p.id, name: p.name }));

  return { faturamentoPeriodo, custoTeoricoTotal, cmvTeoricoPercent, categoriaChart, produtosMaiorImpacto, produtosSemFicha };
}
