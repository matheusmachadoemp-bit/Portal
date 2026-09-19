import { ingredientCostPerUnit } from "@/lib/estoque";
import type { PrismaClient } from "@prisma/client";

export type IngredientForCmv = { id: string; precoAtual: number; quantidadeEmbalagem: number; estoqueAtual: number };
export type MovementForCmv = { ingredientId: string; type: string; quantidade: number; estoqueApos: number; createdAt: Date };

/**
 * Valor do estoque (a custo) em um instante, reconstruído a partir do
 * snapshot `estoqueApos` da última movimentação até aquela data. Sem
 * movimentação registrada antes da data, assume-se o estoque atual (o
 * histórico de movimentações começou a ser registrado agora).
 *
 * Precisa da lista de movimentações JÁ CARREGADA em memória (e não filtra
 * por data — precisa do histórico completo até `at`, senão um insumo sem
 * movimentação DENTRO da lista cai no fallback errado, mesmo tendo uma
 * movimentação mais antiga fora dela). Prefira `snapshotEstoqueEm`/
 * `valorEstoqueDeSnapshot` (mesma semântica, 1 query indexada no banco por
 * insumo, sem carregar nem guardar o histórico inteiro em memória) em
 * código novo — nenhum call site usa mais esta função (o último,
 * `src/app/portal/estoque/page.tsx`, migrou pro snapshot ao corrigir o
 * mesmo bug do achado #181). Mantida sem uso por ora só como referência de
 * semântica (é o "cálculo em JS de referência" usado pra validar
 * `snapshotEstoqueEm` contra um Postgres descartável nos dois casos já
 * corrigidos) — considerar remover se nenhum código novo passar a
 * precisar dela.
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

/**
 * Busca no banco, para cada insumo de `empresaIds`, só a movimentação mais
 * recente com `createdAt <= at` (1 linha por insumo, via `DISTINCT ON` do
 * Postgres) — mesma semântica de `valorEstoqueEm`, mas sem carregar pra
 * memória do servidor o histórico inteiro de movimentações (que só cresce)
 * pra depois escanear em JS. Um insumo ausente do mapa devolvido não teve
 * nenhuma movimentação até `at`; use `valorEstoqueDeSnapshot` para aplicar,
 * nesse caso, o mesmo fallback de `valorEstoqueEm` (estoque atual).
 *
 * SQL específico do Postgres (`DISTINCT ON`) — único banco suportado pelo
 * projeto (`prisma/schema.prisma`, `datasource db { provider = "postgresql" }`).
 */
export async function snapshotEstoqueEm(client: PrismaClient, empresaIds: string[], at: Date): Promise<Map<string, number>> {
  if (empresaIds.length === 0) return new Map();
  const rows = await client.$queryRaw<{ ingredientId: string; estoqueApos: number }[]>`
    SELECT DISTINCT ON ("ingredientId") "ingredientId", "estoqueApos"
    FROM "StockMovement"
    WHERE "empresaId" = ANY(${empresaIds}::text[]) AND "createdAt" <= ${at}
    ORDER BY "ingredientId", "createdAt" DESC
  `;
  return new Map(rows.map((r) => [r.ingredientId, r.estoqueApos]));
}

/**
 * Mesma coisa que `snapshotEstoqueEm`, para várias datas de uma vez (ex.:
 * cada ponto de uma série diária/semanal de CMV) — dispara 1 query por data
 * DISTINTA em paralelo (deduplicando por instante) em vez de 1 por
 * data × insumo escaneado em JS. A chave do mapa devolvido é
 * `at.getTime()` (o instante, não a instância do objeto `Date`) — consulte
 * com `snapshots.get(minhaData.getTime())`.
 */
export async function snapshotsEstoqueEmDatas(
  client: PrismaClient,
  empresaIds: string[],
  datas: Date[]
): Promise<Map<number, Map<string, number>>> {
  const porInstante = new Map<number, Date>();
  for (const data of datas) porInstante.set(data.getTime(), data);

  const pares = await Promise.all(
    [...porInstante.entries()].map(async ([tempo, data]) => [tempo, await snapshotEstoqueEm(client, empresaIds, data)] as const)
  );
  return new Map(pares);
}

/**
 * Valor do estoque (a custo) a partir de um snapshot já resolvido no banco
 * (`snapshotEstoqueEm`/`snapshotsEstoqueEmDatas`) — mesmo fallback de
 * `valorEstoqueEm` (estoque atual do insumo) para quem não aparece no
 * snapshot, ou seja, não teve nenhuma movimentação até a data consultada.
 */
export function valorEstoqueDeSnapshot(ingredients: IngredientForCmv[], snapshot: Map<string, number>): number {
  let total = 0;
  for (const ing of ingredients) {
    const quantidade = snapshot.has(ing.id) ? snapshot.get(ing.id)! : ing.estoqueAtual;
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
