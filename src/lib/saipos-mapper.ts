import type { PaymentMethod, SaleChannel, SalePlatform } from "@prisma/client";
import type { SaiposSaleRecord } from "@/lib/saipos-client";

const PLATFORM_KEYWORDS: [string, SalePlatform][] = [
  ["ifood", "IFOOD"],
  ["99food", "FOOD99"],
  ["99", "FOOD99"],
];

// Ordem importa: a primeira palavra-chave que bater é usada, então as mais
// específicas vêm antes das mais genéricas (mesmo critério usado em
// HEADER_ALIASES/PAYMENT_KEYWORDS de src/app/api/vendas/importar/route.ts,
// para a importação manual de arquivo). "fiado"/"online" foram adicionados
// depois de perceber que o mapeamento aqui nunca tinha sido atualizado com
// PAGO_ONLINE/FIADO (adicionados ao enum PaymentMethod para a importação de
// arquivo) — sem isso, toda venda da Saipos paga por um desses dois meios
// caía silenciosamente em OUTRO.
const PAYMENT_KEYWORDS: [string, PaymentMethod][] = [
  ["pix", "PIX"],
  ["dinheiro", "DINHEIRO"],
  ["cash", "DINHEIRO"],
  ["debito", "CARTAO_DEBITO"],
  ["credito", "CARTAO_CREDITO"],
  ["voucher", "VOUCHER"],
  ["vr", "VOUCHER"],
  ["transferencia", "TRANSFERENCIA"],
  ["cheque", "CHEQUE"],
  ["fiado", "FIADO"],
  ["online", "PAGO_ONLINE"],
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

// Tolerante a variações de formato (a Saipos já mandou booleano puro em vez
// de "Y"/"S" no passado) — sem isso, `normalize()` chamado direto sobre um
// booleano quebra com TypeError (`value.normalize is not a function`) e
// derruba a sincronização inteira por causa de uma única venda.
const CANCELED_VALUES = new Set(["y", "s", "sim", "yes", "true", "1", "cancelado", "canceled", "cancelled"]);

export function isSaiposSaleCanceled(record: SaiposSaleRecord): boolean {
  if (typeof record.canceled === "boolean") return record.canceled;
  if (typeof record.canceled === "number") return record.canceled === 1;
  return CANCELED_VALUES.has(normalize(record.canceled as string | null | undefined));
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

/**
 * Constrói os dados de um registro granular `Sale` a partir de uma venda da
 * Saipos — reaproveita `toSaiposSaleData` (mesma validação de id_sale/
 * shift_date, mesmo mapeamento de canal/plataforma/forma de pagamento) e só
 * adiciona o que é específico de `Sale` (bairro, marcador de origem).
 *
 * Sem item a item (garcom/produtos): a própria Saipos confirmou por e-mail
 * que o endpoint `search_sales` não retorna detalhamento por item nem
 * vínculo com o garçom da venda (testado empiricamente: 0 vendas com
 * "items" no payload, mesmo para vendas de salão) — por isso "Itens
 * vendidos" e "Desempenho por garçom" continuam vazios para vendas
 * sincronizadas automaticamente (aviso já existente na tela de
 * Configurações → Integração Saipos).
 */
export function toSaleData(empresaId: string, record: SaiposSaleRecord) {
  const base = toSaiposSaleData(empresaId, record);
  return {
    empresaId,
    saiposSaleId: base.saiposId,
    dateTime: base.dateTime,
    channel: base.channel,
    platform: base.platform,
    formaPagamento: base.formaPagamento,
    bairro: record.delivery?.district ?? null,
    valorTotal: base.valorTotal,
    cancelado: base.cancelado,
    source: "SAIPOS" as const,
    createdById: null,
  };
}
