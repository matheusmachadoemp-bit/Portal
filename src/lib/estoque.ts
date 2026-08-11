export const STOCK_MOVEMENT_TYPES = ["ENTRADA", "SAIDA", "AJUSTE", "PERDA", "TRANSFERENCIA", "INVENTARIO"] as const;
export type StockMovementTypeKey = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_LABEL: Record<StockMovementTypeKey, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  AJUSTE: "Ajuste",
  PERDA: "Perda",
  TRANSFERENCIA: "Transferência",
  INVENTARIO: "Inventário",
};

export const STOCK_MOVEMENT_TONE: Record<StockMovementTypeKey, "default" | "success" | "warning" | "danger" | "info"> = {
  ENTRADA: "success",
  SAIDA: "info",
  AJUSTE: "default",
  PERDA: "danger",
  TRANSFERENCIA: "warning",
  INVENTARIO: "default",
};

/** Ajuste e Inventário definem o estoque para um valor absoluto (contagem física); os demais tipos são deltas. */
export function isAbsoluteMovement(type: string): boolean {
  return type === "AJUSTE" || type === "INVENTARIO";
}

export function applyMovement(currentStock: number, type: string, quantidade: number): number {
  if (isAbsoluteMovement(type)) return quantidade;
  if (type === "ENTRADA") return currentStock + quantidade;
  return currentStock - quantidade;
}

export function ingredientCostPerUnit(ingredient: { precoAtual: number; quantidadeEmbalagem: number }): number {
  if (!ingredient.quantidadeEmbalagem) return 0;
  return ingredient.precoAtual / ingredient.quantidadeEmbalagem;
}
