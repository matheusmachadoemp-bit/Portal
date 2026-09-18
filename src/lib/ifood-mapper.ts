import type { PaymentMethod, SaleChannel } from "@prisma/client";
import type { IfoodSaleRecord } from "@/lib/ifood-client";

// AVISO DE CONFIANÇA (ver cabeçalho de `ifood-client.ts`): os nomes de campo
// usados abaixo (`orderType`, `salesChannel`, `payments[].method`,
// `payments[].prepaid`, `currentStatus`) vêm da documentação pública do
// iFood, mas não foram testados contra um payload real ainda — isso só
// acontece quando a Fase 1 for testada com uma credencial de verdade. Por
// isso todo campo é lido de forma tolerante (várias chaves candidatas,
// nunca um acesso direto que quebra se o campo não existir) e todo mapeador
// tem um valor-padrão explícito em vez de deixar `undefined` vazar pro
// banco.

function normalize(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Valores documentados do tipo de pedido do iFood: DELIVERY (entrega),
// TAKEOUT (cliente retira no balcão) e INDOOR/DINE_IN (consumo no local,
// pedido feito pelo app/QR code do iFood numa mesa) — os dois últimos
// tratados como SALAO porque, do ponto de vista do relatório de vendas do
// Portal, a diferença entre eles é só COMO o pedido foi feito (indoor vs
// dine-in), não ONDE foi consumido. Diferente do mapeamento de canal da
// Saipos (que infere o canal por heurística, sem um campo direto), aqui o
// iFood informa o tipo do pedido explicitamente — não deveria precisar de
// heurística, mas o fallback pra DELIVERY cobre tanto um pedido realmente
// sem esse campo quanto um valor futuro ainda não mapeado (a maioria
// esmagadora dos pedidos do iFood é delivery).
const ORDER_TYPE_TO_CHANNEL: Record<string, SaleChannel> = {
  DELIVERY: "DELIVERY",
  TAKEOUT: "BALCAO",
  INDOOR: "SALAO",
  DINE_IN: "SALAO",
};

export function mapIfoodChannel(record: IfoodSaleRecord): SaleChannel {
  const raw = record.orderType ?? record.salesChannel ?? record.channel;
  const key = typeof raw === "string" ? raw.toUpperCase().trim() : "";
  return ORDER_TYPE_TO_CHANNEL[key] ?? "DELIVERY";
}

// Instrumento de pagamento (o que o cliente usou), só relevante quando o
// pedido NÃO foi pago antecipado pelo próprio app do iFood (ver
// `mapIfoodPaymentMethod` abaixo pra entender a regra do `prepaid`).
const PAYMENT_METHOD_KEYWORDS: [string, PaymentMethod][] = [
  ["pix", "PIX"],
  ["cash", "DINHEIRO"],
  ["dinheiro", "DINHEIRO"],
  ["debit", "CARTAO_DEBITO"],
  ["debito", "CARTAO_DEBITO"],
  ["credit", "CARTAO_CREDITO"],
  ["credito", "CARTAO_CREDITO"],
  ["meal_voucher", "VOUCHER"],
  ["food_voucher", "VOUCHER"],
  ["voucher", "VOUCHER"],
  ["wallet", "PAGO_ONLINE"],
  ["digital_wallet", "PAGO_ONLINE"],
];

/**
 * A maior parte dos pedidos do iFood é paga integralmente DENTRO do app do
 * iFood (o cliente paga o iFood, o iFood repassa o líquido pra loja depois,
 * descontando comissão — por isso existe toda a API Financial/Settlement).
 * Nesse caso (`prepaid: true`), o instrumento usado pelo cliente (crédito,
 * débito, PIX, carteira digital...) é irrelevante pro fluxo de caixa da
 * loja: o dinheiro nunca passou pelo caixa dela, então do ponto de vista do
 * relatório de vendas do Portal isso é exatamente o cenário que
 * `PAGO_ONLINE` já existe pra representar (mesmo campo criado quando a
 * Saipos começou a reportar vendas do iFood/99Food pagas assim — ver
 * `20260830210000_payment_method_novos_valores`). Só quando `prepaid` for
 * `false` (pagamento na entrega — dinheiro, cartão de maquininha do
 * entregador etc.) é que o instrumento de fato importa, porque aí o valor
 * entra fisicamente no caixa da loja/entregador.
 *
 * CONFIRMAR COM DADO REAL (Fase 2): se essa regra realmente cobrir todos os
 * casos reais (e.g. se `DIGITAL_WALLET` aparecer com `prepaid: false` em
 * algum caso, o que não seria esperado mas não foi possível descartar sem
 * um payload de verdade), OUTRO nunca deve virar a resposta final — nesse
 * caso o enum `PaymentMethod` ganha um valor novo (mesma regra do CLAUDE.md
 * pra importação: nunca aceitar "Outros" como resposta definitiva pra uma
 * fatia significativa das vendas).
 */
export function mapIfoodPaymentMethod(record: IfoodSaleRecord): PaymentMethod {
  const payments = Array.isArray(record.payments) ? record.payments : record.paymentMethod ? [record.paymentMethod] : [];
  if (payments.length === 0) return "OUTRO";

  const main = payments.reduce((a, b) => ((b.value ?? 0) > (a.value ?? 0) ? b : a));
  if (main.prepaid) return "PAGO_ONLINE";

  const normalized = normalize(main.method ?? main.type);
  for (const [keyword, method] of PAYMENT_METHOD_KEYWORDS) {
    if (normalized.includes(keyword)) return method;
  }
  return "OUTRO";
}

const CANCELED_STATUSES = new Set(["cancelled", "canceled", "cancelado"]);

export function isIfoodOrderCanceled(record: IfoodSaleRecord): boolean {
  return CANCELED_STATUSES.has(normalize(record.currentStatus));
}

/**
 * Monta os dados de um pedido do iFood pra gravar em `IfoodOrder`
 * (staging — Fase 1, ver comentário no `schema.prisma`). Assim como
 * `toSaiposSaleData` em `saipos-mapper.ts`, o identificador do pedido não
 * tem fallback razoável: sem ele não dá pra fazer upsert nem identificar o
 * pedido depois, então falha alto (capturado por quem chama esta função) em
 * vez de gravar um `ifoodOrderId` inválido silenciosamente.
 */
export function toIfoodOrderData(empresaId: string, merchantId: string, record: IfoodSaleRecord) {
  const orderId = record.id ?? record.orderId ?? record.saleId;
  if (typeof orderId !== "string" || !orderId) {
    throw new Error(
      "Um pedido retornado pelo iFood não tem nenhum dos campos id/orderId/saleId — não é possível identificá-lo."
    );
  }

  const rawDate = record.salesDate ?? record.orderDate ?? record.createdAt;
  const orderDate = typeof rawDate === "string" ? new Date(rawDate) : null;
  if (!orderDate || Number.isNaN(orderDate.getTime())) {
    throw new Error(
      `Pedido ${orderId} do iFood veio sem uma data válida (campos tentados: salesDate/orderDate/createdAt, recebido: ${JSON.stringify(rawDate)}).`
    );
  }

  return {
    empresaId,
    ifoodOrderId: orderId,
    merchantId,
    orderDate,
    channel: mapIfoodChannel(record),
    platform: "IFOOD" as const,
    formaPagamento: mapIfoodPaymentMethod(record),
    valorTotal: Number(record.saleGrossValue ?? 0),
    cancelado: isIfoodOrderCanceled(record),
    raw: record as object,
  };
}
