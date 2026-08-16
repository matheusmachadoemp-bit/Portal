import type { PaymentMethod, SaleChannel } from "@prisma/client";
import type { SaiposSaleRecord } from "@/lib/saipos-client";

const PAYMENT_KEYWORDS: [string, PaymentMethod][] = [
  ["pix", "PIX"],
  ["dinheiro", "DINHEIRO"],
  ["cash", "DINHEIRO"],
  ["debito", "CARTAO_DEBITO"],
  ["credito", "CARTAO_CREDITO"],
  ["voucher", "VOUCHER"],
  ["vr", "VOUCHER"],
  ["cheque", "CHEQUE"],
];

function normalize(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** A API da Saipos não retorna um campo de "canal" direto; inferimos a partir de delivery/parceiro/mesa. */
export function mapSaiposChannel(record: SaiposSaleRecord): SaleChannel {
  if (record.delivery?.delivery_by) return "DELIVERY";
  if (record.partner_sale?.desc_partner_sale) return "DELIVERY";
  if (record.table_order) return "SALAO";
  return "BALCAO";
}

export function mapSaiposPaymentMethod(record: SaiposSaleRecord): PaymentMethod {
  const payments = Array.isArray(record.payments) ? record.payments : [];
  if (!payments.length) return "OUTRO";
  const main = payments.reduce((a, b) => (b.payment_amount > a.payment_amount ? b : a));
  const normalized = normalize(main.desc_store_payment_type);
  for (const [keyword, method] of PAYMENT_KEYWORDS) {
    if (normalized.includes(keyword)) return method;
  }
  return "OUTRO";
}

export function isSaiposSaleCanceled(record: SaiposSaleRecord): boolean {
  return normalize(record.canceled) === "y" || normalize(record.canceled) === "s";
}

export function toSaiposSaleData(empresaId: string, record: SaiposSaleRecord) {
  return {
    empresaId,
    saiposId: String(record.id_sale),
    shiftDate: new Date(record.shift_date),
    dateTime: new Date(record.created_at ?? record.shift_date),
    channel: mapSaiposChannel(record),
    formaPagamento: mapSaiposPaymentMethod(record),
    valorTotal: Number(record.total_amount ?? 0),
    raw: record as object,
  };
}
