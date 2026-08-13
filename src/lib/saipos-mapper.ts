import type { PaymentMethod, SaleChannel } from "@prisma/client";
import type { SaiposSaleRecord } from "@/lib/saipos-client";

const CHANNEL_MAP: Record<string, SaleChannel> = {
  delivery: "DELIVERY",
  ifood: "DELIVERY",
  balcao: "BALCAO",
  counter: "BALCAO",
  salao: "SALAO",
  dine_in: "SALAO",
  mesa: "SALAO",
};

const PAYMENT_MAP: Record<string, PaymentMethod> = {
  pix: "PIX",
  dinheiro: "DINHEIRO",
  cash: "DINHEIRO",
  debito: "CARTAO_DEBITO",
  debit: "CARTAO_DEBITO",
  credito: "CARTAO_CREDITO",
  credit: "CARTAO_CREDITO",
  voucher: "VOUCHER",
  vr: "VOUCHER",
  cheque: "CHEQUE",
};

function normalize(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function mapSaiposChannel(raw?: string | null): SaleChannel {
  return CHANNEL_MAP[normalize(raw)] ?? "SALAO";
}

export function mapSaiposPaymentMethod(raw?: string | null): PaymentMethod {
  return PAYMENT_MAP[normalize(raw)] ?? "OUTRO";
}

export function toSaiposSaleData(empresaId: string, record: SaiposSaleRecord) {
  return {
    empresaId,
    saiposId: String(record.id),
    shiftDate: new Date(record.shift_date),
    dateTime: new Date(record.date_time ?? record.shift_date),
    channel: mapSaiposChannel(record.channel),
    formaPagamento: mapSaiposPaymentMethod(record.payment_method),
    valorTotal: Number(record.total_value ?? 0),
    raw: record as object,
  };
}
