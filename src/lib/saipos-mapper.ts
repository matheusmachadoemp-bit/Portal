import type { PaymentMethod, SaleChannel, SalePlatform } from "@prisma/client";
import type { SaiposSaleRecord } from "@/lib/saipos-client";

const PLATFORM_KEYWORDS: [string, SalePlatform][] = [
  ["ifood", "IFOOD"],
  ["99food", "FOOD99"],
  ["99", "FOOD99"],
];

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

/** Deduz a plataforma (site próprio/iFood/99Food) a partir do nome do parceiro retornado pela Saipos. */
export function mapSaiposPlatform(record: SaiposSaleRecord): SalePlatform {
  const desc = normalize(record.partner_sale?.desc_partner_sale);
  if (!desc) return "SITE_PROPRIO";
  for (const [keyword, platform] of PLATFORM_KEYWORDS) {
    if (desc.includes(keyword)) return platform;
  }
  return "SITE_PROPRIO";
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

const CANCELED_VALUES = new Set(["y", "s", "sim", "yes", "true", "1", "cancelado", "canceled", "cancelled"]);

export function isSaiposSaleCanceled(record: SaiposSaleRecord): boolean {
  if (typeof record.canceled === "boolean") return record.canceled;
  return CANCELED_VALUES.has(normalize(record.canceled));
}

export function toSaiposSaleData(empresaId: string, record: SaiposSaleRecord) {
  return {
    empresaId,
    saiposId: String(record.id_sale),
    shiftDate: new Date(record.shift_date),
    dateTime: new Date(record.created_at ?? record.shift_date),
    channel: mapSaiposChannel(record),
    platform: mapSaiposPlatform(record),
    formaPagamento: mapSaiposPaymentMethod(record),
    valorTotal: Number(record.total_amount ?? 0),
    cancelado: isSaiposSaleCanceled(record),
    raw: record as object,
  };
}

/**
 * Constrói os dados de um registro granular `Sale` a partir de uma venda da
 * Saipos, para alimentar as telas de Entrega/Pagamento/Por-hora/Faturamento
 * e Acompanhamento de Vendas, que leem da tabela `Sale` (não do agregado
 * diário `SalesEntry`).
 */
export function toSaleData(empresaId: string, record: SaiposSaleRecord) {
  return {
    empresaId,
    saiposSaleId: String(record.id_sale),
    dateTime: new Date(record.created_at ?? record.shift_date),
    channel: mapSaiposChannel(record),
    platform: mapSaiposPlatform(record),
    formaPagamento: mapSaiposPaymentMethod(record),
    bairro: record.delivery?.district ?? null,
    valorTotal: Number(record.total_amount ?? 0),
    cancelado: isSaiposSaleCanceled(record),
    source: "SAIPOS" as const,
    createdById: null,
  };
}
