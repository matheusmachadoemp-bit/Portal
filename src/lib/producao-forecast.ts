/**
 * Motor de previsão de produção — Fase 1.
 *
 * Isolado de propósito (seção 40 do escopo): todas as funções aqui são puras
 * (sem chamada a banco), recebem os dados já buscados e devolvem números.
 * Isso permite trocar os passos 1-3 (hoje: média semanal x peso do dia da
 * semana, porque só existe venda importada por semana) por um cálculo real
 * de "média das últimas 4 mesmas-datas-da-semana" assim que existir captura
 * diária de vendas — sem mexer no resto do módulo (BOM, margem, lote, etc).
 */

export type WeeklyTotal = { weekStart: string; total: number };

/** Passo 1 — soma a quantidade vendida de um produto por semana (cada linha
 * de `ImportedSaleItem` já vem de uma importação semanal, uma linha por
 * período). Semanas repetidas (duas importações cobrindo a mesma semana)
 * somam entre si. */
export function computeWeeklyTotals(
  salesRows: { periodFrom: Date | string; quantidade: number }[]
): WeeklyTotal[] {
  const totals = new Map<string, number>();
  for (const row of salesRows) {
    const weekStart = typeof row.periodFrom === "string" ? row.periodFrom : row.periodFrom.toISOString();
    const key = weekStart.slice(0, 10);
    totals.set(key, (totals.get(key) ?? 0) + row.quantidade);
  }
  return Array.from(totals.entries())
    .map(([weekStart, total]) => ({ weekStart, total }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

/** Passo 2 — média das últimas N semanas (mais recentes). Guarda quais
 * semanas entraram na conta para a explicação "como chegamos nesse número"
 * (seção 28). */
export function computeWeeklyAverage(
  weeklyTotals: WeeklyTotal[],
  semanasParaMedia: number
): { mediaSemanal: number; weeksUsed: WeeklyTotal[] } {
  const weeksUsed = weeklyTotals.slice(-semanasParaMedia);
  if (weeksUsed.length === 0) return { mediaSemanal: 0, weeksUsed: [] };
  const soma = weeksUsed.reduce((acc, w) => acc + w.total, 0);
  return { mediaSemanal: soma / weeksUsed.length, weeksUsed };
}

/** Passo 3 — aplica o peso % do dia da semana sobre a média semanal, dando
 * a previsão de vendas do produto para aquele dia específico. */
export function applyWeekdayWeight(mediaSemanal: number, weekday: number, weights: { weekday: number; percent: number }[]): number {
  const weight = weights.find((w) => w.weekday === weekday);
  const percent = weight?.percent ?? 100 / 7;
  return mediaSemanal * (percent / 100);
}

export type ProductForecast = { productId: string; forecastQty: number };
export type BomLine = { productId: string; ingredientId: string; quantidadeUsada: number; percentualPerda: number };

/** Passo 4 — explode a previsão de vendas de cada produto vendável na
 * necessidade de insumos crus via a ficha técnica já existente
 * (`ProductIngredient`), somando insumos repetidos entre produtos
 * diferentes (seção 7). */
export function explodeProductForecastToIngredients(
  productForecasts: ProductForecast[],
  bom: BomLine[]
): Map<string, number> {
  const forecastByProduct = new Map(productForecasts.map((p) => [p.productId, p.forecastQty]));
  const demand = new Map<string, number>();
  for (const line of bom) {
    const forecastQty = forecastByProduct.get(line.productId);
    if (!forecastQty) continue;
    const perda = 1 + line.percentualPerda / 100;
    const need = forecastQty * line.quantidadeUsada * perda;
    demand.set(line.ingredientId, (demand.get(line.ingredientId) ?? 0) + need);
  }
  return demand;
}

/** Passo 5 — usa a ponte `ProductionItem.ingredientId` para converter
 * necessidade de insumo em necessidade por item de produção. */
export function rollUpToProductionItems(
  ingredientDemand: Map<string, number>,
  items: { id: string; ingredientId: string | null }[]
): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) {
    if (!item.ingredientId) continue;
    const need = ingredientDemand.get(item.ingredientId);
    if (need) result.set(item.id, need);
  }
  return result;
}

/** Passo 6 — margem de segurança (%) sobre a necessidade prevista. */
export function applySafetyMargin(necessidadePrevista: number, margemSeguranca: number): number {
  return necessidadePrevista * (1 + margemSeguranca / 100);
}

/** Passo 7 — arredonda para o múltiplo de lote mais próximo PARA CIMA
 * (nunca para baixo — seção 11: 9,7kg com lote de 3kg vira 4 lotes = 12kg). */
export function roundToLotSize(quantidade: number, tamanhoLote: number | null | undefined): number {
  if (!tamanhoLote || tamanhoLote <= 0) return quantidade;
  return Math.ceil(quantidade / tamanhoLote) * tamanhoLote;
}

/** Passo 8 — item de produção fixa nunca produz menos que a quantidade
 * mínima diária, mesmo que a previsão calculada seja menor (seção 12). */
export function applyMinimumFloor(quantidade: number, tipo: string, quantidadeMinima: number): number {
  return tipo === "FIXO" ? Math.max(quantidade, quantidadeMinima) : quantidade;
}

/** Passo 9 — orquestra 6→7→8 sobre a necessidade líquida (necessidade
 * prevista menos o que já está pronto em estoque, nunca negativa). */
export function computeQuantidadeSugerida(
  necessidadePrevista: number,
  estoqueProntoSnapshot: number,
  item: { tipo: string; margemSeguranca: number; tamanhoLote: number | null; quantidadeMinima: number }
): number {
  const necessidadeLiquida = Math.max(necessidadePrevista - estoqueProntoSnapshot, 0);
  const comMargem = applySafetyMargin(necessidadeLiquida, item.margemSeguranca);
  const comLote = roundToLotSize(comMargem, item.tamanhoLote);
  return applyMinimumFloor(comLote, item.tipo, item.quantidadeMinima);
}
