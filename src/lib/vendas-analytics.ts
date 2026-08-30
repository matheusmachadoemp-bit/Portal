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
  PAGO_ONLINE: "Pago Online",
  FIADO: "Fiado",
  OUTRO: "Outros",
};

export const SALE_PAYMENT_METHODS = [
  "PIX",
  "DINHEIRO",
  "CARTAO_DEBITO",
  "CARTAO_CREDITO",
  "VOUCHER",
  "PAGO_ONLINE",
  "FIADO",
  "OUTRO",
] as const;

export const SALE_CHANNEL_LABEL: Record<string, string> = {
  SALAO: "Salão",
  DELIVERY: "Delivery",
  BALCAO: "Balcão",
};

export const SALE_PLATFORM_LABEL: Record<string, string> = {
  SITE_PROPRIO: "Site próprio",
  IFOOD: "iFood",
  FOOD99: "99Food",
};

export const SALE_PLATFORMS = ["SITE_PROPRIO", "IFOOD", "FOOD99"] as const;

export type Turno = "ALMOCO" | "JANTAR";

export const TURNO_LABEL: Record<Turno, string> = { ALMOCO: "Almoço", JANTAR: "Jantar" };

/** Turno calculado a partir do horário da venda: até 17h = Almoço, depois = Jantar. */
export function getTurno(dateTime: Date): Turno {
  return dateTime.getHours() < 17 ? "ALMOCO" : "JANTAR";
}

export const SALE_TYPE_ORDER = ["ENTREGA", "BALCAO", "SALAO", "CANCELADO"] as const;
export type SaleType = (typeof SALE_TYPE_ORDER)[number];

export const SALE_TYPE_LABEL: Record<SaleType, string> = {
  ENTREGA: "Entrega",
  BALCAO: "Balcão",
  SALAO: "Salão",
  CANCELADO: "Cancelado",
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
