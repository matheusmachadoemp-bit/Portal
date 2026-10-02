import { prisma } from "@/lib/prisma";
import {
  breakdownMovimentacoesNoPeriodo,
  cmvRealValor,
  snapshotEstoqueEm,
  valorEstoqueDeSnapshot,
  cmvTeoricoPercentCatalogo,
  cmvTeoricoPercentPonderado,
} from "@/lib/cmv";
import { productTotalCost, cmvPercent, PRODUCT_CATEGORY_LABEL } from "@/lib/ficha";

/**
 * Quantidade vendida de cada produto no período, somando venda direta (`SaleItem`, vinculada a
 * `Sale.dateTime`) e itens importados do Saipos (`ImportedSaleItem`, vinculados por
 * `periodTo` — mesmo critério de `computeItensVendidosRows` em `@/lib/faturamento-analytics`,
 * que já faz essa mesma junção pra Curva ABC). Itens sem `productId` (produto não identificado/
 * não casado no import) não entram — não têm como alimentar o mix ponderado de uma ficha técnica
 * específica.
 */
export async function quantidadeVendidaPorProdutoNoPeriodo(empresaIds: string[], from: Date, to: Date): Promise<Map<string, number>> {
  const [items, importedItems] = await Promise.all([
    prisma.saleItem.findMany({
      where: { productId: { not: null }, sale: { empresaId: { in: empresaIds }, dateTime: { gte: from, lte: to } } },
      select: { productId: true, quantidade: true },
    }),
    prisma.importedSaleItem.findMany({
      where: { empresaId: { in: empresaIds }, productId: { not: null }, periodTo: { gte: from, lte: to } },
      select: { productId: true, quantidade: true },
    }),
  ]);

  const map = new Map<string, number>();
  for (const item of [...items, ...importedItems]) {
    if (!item.productId) continue;
    map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantidade);
  }
  return map;
}

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
    // Achado de produção (02/10/2026): sem nenhuma movimentação de estoque no período, o CMV Real
    // em % caía em "0%" (ver `faturamento ? ... : 0` nos clients que consomem isto) — enganoso,
    // parece "custo zero" quando na verdade é "não há como calcular ainda". `semMovimentacao` diz
    // pro client mostrar "Sem dados" em vez de "0%" nesse caso (loja nova, período sem nenhuma
    // ENTRADA/SAIDA/AJUSTE/PERDA/TRANSFERENCIA/INVENTARIO registrada).
    semMovimentacao: movements.length === 0,
  };
}

export async function computeCmvTeorico(empresaIds: string[], from: Date, to: Date, metaCmvPercent: number) {
  const [products, salesEntries, quantidadeVendida] = await Promise.all([
    prisma.product.findMany({ where: { empresaId: { in: empresaIds } }, include: { ingredients: { include: { ingredient: true } } } }),
    prisma.salesEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: from, lte: to } } }),
    quantidadeVendidaPorProdutoNoPeriodo(empresaIds, from, to),
  ]);

  const productsWithCost = products.map((p) => ({
    ...p,
    totalCost: productTotalCost(p.ingredients),
    quantidadeVendida: quantidadeVendida.get(p.id) ?? 0,
  }));
  // CMV teórico ponderado pelo mix de vendas do período (ver cmvTeoricoPercentPonderado em
  // @/lib/cmv) — cai no blended por catálogo só se nenhuma venda do período tiver produto
  // identificado (ex.: ainda sem vendas importadas/lançadas apontando pra um Product).
  const cmvTeoricoPercent = cmvTeoricoPercentPonderado(productsWithCost) ?? cmvTeoricoPercentCatalogo(productsWithCost);
  const faturamentoPeriodo = salesEntries.reduce((s, e) => s + e.faturamentoDelivery + e.faturamentoSalao, 0);
  const custoTeoricoTotal = (cmvTeoricoPercent / 100) * faturamentoPeriodo;

  const categoriaChart = Object.entries(PRODUCT_CATEGORY_LABEL)
    .map(([key, label]) => {
      const items = productsWithCost.filter((p) => p.category === key && p.precoVenda > 0);
      const value = cmvTeoricoPercentPonderado(items) ?? cmvTeoricoPercentCatalogo(items);
      return { name: label, value: Math.round(value * 10) / 10, produtos: items.length };
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
