export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  PIX: "Pix",
  DINHEIRO: "Dinheiro",
  CARTAO_DEBITO: "Débito",
  CARTAO_CREDITO: "Crédito",
  VOUCHER: "Voucher",
  TED: "TED",
  DOC: "DOC",
  TRANSFERENCIA: "Transferência",
  CHEQUE: "Cheque",
  OUTRO: "Outros",
};

export const SALE_PAYMENT_METHODS = ["PIX", "DINHEIRO", "CARTAO_DEBITO", "CARTAO_CREDITO", "VOUCHER", "OUTRO"] as const;

export const SALE_CHANNEL_LABEL: Record<string, string> = {
  SALAO: "Salão",
  DELIVERY: "Delivery",
  BALCAO: "Balcão",
};

export type AbcClass = "A" | "B" | "C";

export function classifyAbc(cumulativeShare: number): AbcClass {
  if (cumulativeShare <= 80) return "A";
  if (cumulativeShare <= 95) return "B";
  return "C";
}

/** Curva ABC: ordena por um critério (quantidade/faturamento/margem) e classifica pela participação acumulada. */
export function buildCurvaAbc<T extends { value: number }>(
  items: T[]
): (T & { participacaoPercent: number; participacaoAcumuladaPercent: number; classe: AbcClass })[] {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  const sorted = [...items].sort((a, b) => b.value - a.value);
  let acumulado = 0;
  return sorted.map((item) => {
    const participacaoPercent = total ? (item.value / total) * 100 : 0;
    acumulado += participacaoPercent;
    return { ...item, participacaoPercent, participacaoAcumuladaPercent: acumulado, classe: classifyAbc(acumulado) };
  });
}
