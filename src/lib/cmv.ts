import { ingredientCostPerUnit } from "@/lib/estoque";

export type IngredientForCmv = { id: string; precoAtual: number; quantidadeEmbalagem: number; estoqueAtual: number };
export type MovementForCmv = { ingredientId: string; type: string; quantidade: number; estoqueApos: number; createdAt: Date };

/**
 * Valor do estoque (a custo) em um instante, reconstruído a partir do
 * snapshot `estoqueApos` da última movimentação até aquela data. Sem
 * movimentação registrada antes da data, assume-se o estoque atual (o
 * histórico de movimentações começou a ser registrado agora).
 */
export function valorEstoqueEm(ingredients: IngredientForCmv[], movementsDesc: MovementForCmv[], at: Date): number {
  let total = 0;
  for (const ing of ingredients) {
    const snapshot = movementsDesc.find((m) => m.ingredientId === ing.id && m.createdAt <= at);
    const quantidade = snapshot ? snapshot.estoqueApos : ing.estoqueAtual;
    total += quantidade * ingredientCostPerUnit(ing);
  }
  return total;
}

export function valorComprasNoPeriodo(
  ingredients: IngredientForCmv[],
  movements: MovementForCmv[],
  start: Date,
  end: Date
): number {
  const costById = new Map(ingredients.map((i) => [i.id, ingredientCostPerUnit(i)]));
  return movements
    .filter((m) => m.type === "ENTRADA" && m.createdAt >= start && m.createdAt <= end)
    .reduce((sum, m) => sum + m.quantidade * (costById.get(m.ingredientId) ?? 0), 0);
}

/** CMV Real = Estoque Inicial + Compras - Estoque Final. */
export function cmvRealValor(estoqueInicial: number, compras: number, estoqueFinal: number): number {
  return estoqueInicial + compras - estoqueFinal;
}

/**
 * CMV teórico "blended": soma do custo de todas as fichas técnicas do
 * catálogo dividida pela soma dos preços de venda — equivalente ao CMV%
 * médio se cada produto vendesse exatamente uma unidade. É uma
 * aproximação: o sistema ainda não registra a quantidade vendida por
 * produto, então não é possível ponderar pelo mix real de vendas.
 */
export function cmvTeoricoPercentCatalogo(products: { totalCost: number; precoVenda: number }[]): number {
  const valid = products.filter((p) => p.precoVenda > 0);
  const totalCusto = valid.reduce((sum, p) => sum + p.totalCost, 0);
  const totalVenda = valid.reduce((sum, p) => sum + p.precoVenda, 0);
  if (!totalVenda) return 0;
  return (totalCusto / totalVenda) * 100;
}

/** Diferença operacional (CMV Real − CMV Teórico), em reais e pontos percentuais. */
export function diferencaOperacional(cmvRealValor: number, cmvTeoricoValor: number) {
  return cmvRealValor - cmvTeoricoValor;
}

export function diferencaPontosPercentuais(cmvRealPercent: number, cmvTeoricoPercent: number) {
  return cmvRealPercent - cmvTeoricoPercent;
}

export type MovementWithOrigin = MovementForCmv & { origin?: string | null };

/**
 * Reconstrói as linhas do CMV Real (compras, transferências, perdas, ajustes)
 * a partir do campo `origin` das movimentações, para exibição detalhada na
 * tela "CMV Real" (estoque inicial + compras +/- transferências − estoque
 * final = custo consumido).
 */
export function breakdownMovimentacoesNoPeriodo(
  ingredients: IngredientForCmv[],
  movements: MovementWithOrigin[],
  start: Date,
  end: Date
) {
  const costById = new Map(ingredients.map((i) => [i.id, ingredientCostPerUnit(i)]));
  const noPeriodo = movements.filter((m) => m.createdAt >= start && m.createdAt <= end);
  const valorDe = (list: MovementWithOrigin[]) =>
    list.reduce((sum, m) => sum + m.quantidade * (costById.get(m.ingredientId) ?? 0), 0);

  const compras = noPeriodo.filter((m) => m.type === "ENTRADA" && (m.origin ?? "COMPRA") === "COMPRA");
  const transferenciasRecebidas = noPeriodo.filter((m) => m.origin === "TRANSFERENCIA_RECEBIDA");
  const transferenciasEnviadas = noPeriodo.filter((m) => m.origin === "TRANSFERENCIA_ENVIADA" || m.type === "TRANSFERENCIA");
  const perdas = noPeriodo.filter((m) => m.type === "PERDA");
  const ajustes = noPeriodo.filter((m) => m.type === "AJUSTE");
  const devolucoes = noPeriodo.filter((m) => m.origin === "DEVOLUCAO_FORNECEDOR");

  return {
    compras: valorDe(compras),
    transferenciasRecebidas: valorDe(transferenciasRecebidas),
    transferenciasEnviadas: valorDe(transferenciasEnviadas),
    perdas: valorDe(perdas),
    ajustes: valorDe(ajustes),
    devolucoes: valorDe(devolucoes),
  };
}
