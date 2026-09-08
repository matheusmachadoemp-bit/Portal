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

export function isSaiposSaleCanceled(record: SaiposSaleRecord): boolean {
  return normalize(record.canceled) === "y" || normalize(record.canceled) === "s";
}

/**
 * Diferente dos demais campos deste mapeamento (todos lidos com `??`/optional
 * chaining para tolerar ausência), `id_sale` e `shift_date` não têm um
 * fallback razoável: sem eles não dá pra identificar a venda nem o dia a que
 * ela pertence. Se a Saipos algum dia mudar/omitir esses campos, é melhor
 * falhar aqui com uma mensagem clara (capturada por quem chama esta função)
 * do que gravar `saiposId: "undefined"` ou uma data inválida silenciosamente.
 */
export function toSaiposSaleData(empresaId: string, record: SaiposSaleRecord) {
  if (record.id_sale === undefined || record.id_sale === null) {
    throw new Error(
      "Uma venda retornada pela Saipos não tem o campo obrigatório id_sale — não é possível identificá-la."
    );
  }

  const shiftDate = new Date(record.shift_date);
  if (Number.isNaN(shiftDate.getTime())) {
    throw new Error(
      `Venda ${record.id_sale} da Saipos veio com shift_date inválido ou ausente (recebido: ${JSON.stringify(record.shift_date)}).`
    );
  }

  const dateTime = new Date(record.created_at ?? record.shift_date);

  return {
    empresaId,
    saiposId: String(record.id_sale),
    shiftDate,
    // created_at é só informativo (hora exata da venda); se vier num formato
    // inválido, cai para o shiftDate (já validado acima) em vez de gravar
    // uma data quebrada.
    dateTime: Number.isNaN(dateTime.getTime()) ? shiftDate : dateTime,
    channel: mapSaiposChannel(record),
    platform: mapSaiposPlatform(record),
    formaPagamento: mapSaiposPaymentMethod(record),
    valorTotal: Number(record.total_amount ?? 0),
    cancelado: isSaiposSaleCanceled(record),
    raw: record as object,
  };
}
