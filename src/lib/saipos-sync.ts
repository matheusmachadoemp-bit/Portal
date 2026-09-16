import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/vault";
import { fetchSaiposSales } from "@/lib/saipos-client";
import { toSaiposSaleData, toSaleData } from "@/lib/saipos-mapper";
import { notifySyncFailure } from "@/lib/sync-notifications";
import type { Empresa } from "@prisma/client";

export type SaiposSyncOutcome = { ok: true; recordsSynced: number } | { ok: false; error: string };

/**
 * Atualiza em lote as vendas da Saipos já existentes com uma única query SQL
 * (`UPDATE ... FROM UNNEST(...)`), no mesmo espírito de
 * `upsertMetaAdsInsightRows` em `meta-ads-sync.ts`. A versão anterior usava
 * `prisma.$transaction(toUpdate.map((data) => prisma.saiposSale.update(...)))`
 * — a API de "sequential operations" do Prisma, que roda cada update um
 * atrás do outro dentro de uma única transação interativa com timeout padrão
 * de 5s. Com a janela de sync padrão de 2 dias, uma loja com bom volume de
 * vendas facilmente tem centenas de vendas repetidas nesse intervalo — cada
 * uma virando 1 UPDATE sequencial contra o Neon (latência de rede maior que
 * um Postgres local) — e o tempo total passava dos 5s, derrubando a
 * transação inteira (e a sincronização inteira, sem nenhum dado atualizado).
 * Este bulk update roda como uma única query normal (nunca uma transação
 * interativa, então nunca tem esse timeout) e usa apenas 9 parâmetros
 * (um array por coluna) não importa quantas linhas existam — não depende do
 * volume de vendas para não estourar.
 */
async function bulkUpdateSaiposSales(empresaId: string, rows: ReturnType<typeof toSaiposSaleData>[]): Promise<void> {
  if (rows.length === 0) return;

  const saiposIds = rows.map((r) => r.saiposId);
  const shiftDates = rows.map((r) => r.shiftDate);
  const dateTimes = rows.map((r) => r.dateTime);
  const channels = rows.map((r) => r.channel);
  const platforms = rows.map((r) => r.platform);
  const formasPagamento = rows.map((r) => r.formaPagamento);
  const valoresTotal = rows.map((r) => r.valorTotal);
  const cancelados = rows.map((r) => r.cancelado);
  const raws = rows.map((r) => JSON.stringify(r.raw ?? null));

  await prisma.$executeRaw`
    UPDATE "SaiposSale" AS s
    SET
      "shiftDate" = v.shift_date,
      "dateTime" = v.date_time,
      "channel" = v.channel::"SaleChannel",
      "platform" = v.platform::"SalePlatform",
      "formaPagamento" = v.forma_pagamento::"PaymentMethod",
      "valorTotal" = v.valor_total,
      "cancelado" = v.cancelado,
      "raw" = v.raw_txt::jsonb
    FROM UNNEST(
      ${saiposIds}::text[], ${shiftDates}::timestamp[], ${dateTimes}::timestamp[],
      ${channels}::text[], ${platforms}::text[], ${formasPagamento}::text[],
      ${valoresTotal}::float8[], ${cancelados}::boolean[], ${raws}::text[]
    ) AS v(saipos_id, shift_date, date_time, channel, platform, forma_pagamento, valor_total, cancelado, raw_txt)
    WHERE s."empresaId" = ${empresaId} AND s."saiposId" = v.saipos_id
  `;
}

/**
 * Sincroniza as vendas da Saipos de uma empresa para um intervalo de datas
 * (máx. 15 dias, conforme limite da API). Faz upsert por `saiposId` para
 * ser seguro re-executar sobre o mesmo período.
 */
export async function syncEmpresaSaiposSales(
  empresa: Pick<Empresa, "id" | "saiposApiToken">,
  range: { start: Date; end: Date }
): Promise<SaiposSyncOutcome> {
  if (!empresa.saiposApiToken) {
    return { ok: false, error: "Token da Saipos não configurado para esta loja." };
  }

  // A partir daqui qualquer etapa pode falhar de formas inesperadas (token
  // salvo corrompido, API da Saipos mudando o formato da resposta, banco
  // indisponível etc.). Tudo fica dentro de um try/catch único para que o
  // usuário sempre receba uma mensagem legível — nunca um erro genérico —
  // e para que o SaiposSyncLog nunca fique preso em EM_ANDAMENTO.
  let log: { id: string } | null = null;
  try {
    log = await prisma.saiposSyncLog.create({
      data: { empresaId: empresa.id, status: "EM_ANDAMENTO" },
    });

    // Limpa registros órfãos de uma versão anterior do mapeamento, em que o
    // identificador da venda não era extraído corretamente.
    await prisma.saiposSale.deleteMany({ where: { empresaId: empresa.id, saiposId: "undefined" } });

    let token: string;
    try {
      token = decryptSecret(empresa.saiposApiToken);
    } catch (err) {
      throw new Error(
        `Não foi possível decifrar o token salvo — tente cadastrar o token novamente em Configurações. (Detalhe técnico: ${errorMessageOf(err)})`
      );
    }
    if (!token) {
      throw new Error(
        "O token salvo está em um formato inválido ou corrompido — tente cadastrar o token novamente em Configurações."
      );
    }

    const result = await fetchSaiposSales(token, range);

    if (!result.ok) {
      await prisma.saiposSyncLog.update({
        where: { id: log.id },
        data: { status: "ERRO", errorMessage: result.error, finishedAt: new Date() },
      });
      await notifySyncFailure({ empresaId: empresa.id, integration: "SAIPOS", errorMessage: result.error });
      return { ok: false, error: result.error };
    }

    // Vendas canceladas são gravadas (não descartadas) para alimentar as
    // telas de Acompanhamento de Vendas; ficam de fora dos agregados de
    // faturamento em syncSalesEntriesFromSaipos abaixo.
    const salesData = result.sales.map((r) => toSaiposSaleData(empresa.id, r));

    if (salesData.length > 0) {
      const existing = await prisma.saiposSale.findMany({
        where: { empresaId: empresa.id, saiposId: { in: salesData.map((d) => d.saiposId) } },
        select: { saiposId: true },
      });
      const existingIds = new Set(existing.map((e) => e.saiposId));
      const toCreate = salesData.filter((d) => !existingIds.has(d.saiposId));
      const toUpdate = salesData.filter((d) => existingIds.has(d.saiposId));

      if (toCreate.length > 0) {
        await prisma.saiposSale.createMany({ data: toCreate, skipDuplicates: true });
      }
      if (toUpdate.length > 0) {
        await bulkUpdateSaiposSales(empresa.id, toUpdate);
      }
    }

    await syncSalesEntriesFromSaipos(empresa.id, range);
    await syncSalesFromSaipos(
      empresa.id,
      result.sales.map((r) => toSaleData(empresa.id, r))
    );

    await prisma.$transaction([
      prisma.saiposSyncLog.update({
        where: { id: log.id },
        data: { status: "SUCESSO", recordsSynced: result.sales.length, finishedAt: new Date() },
      }),
      prisma.empresa.update({ where: { id: empresa.id }, data: { saiposLastSyncAt: new Date() } }),
    ]);

    return { ok: true, recordsSynced: result.sales.length };
  } catch (err) {
    const message = errorMessageOf(err);
    if (log) {
      // Se até a atualização do log falhar (ex.: banco caiu no meio da
      // sincronização), não deixa esse erro secundário mascarar a mensagem
      // original — o log só fica preso em EM_ANDAMENTO nesse caso extremo.
      await prisma.saiposSyncLog
        .update({ where: { id: log.id }, data: { status: "ERRO", errorMessage: message, finishedAt: new Date() } })
        .catch(() => {});
    }
    await notifySyncFailure({ empresaId: empresa.id, integration: "SAIPOS", errorMessage: message });
    return { ok: false, error: message };
  }
}

/**
 * Mesmo padrão de `bulkUpdateSaiposSales` acima (uma única query UPDATE...FROM
 * UNNEST, sem `$transaction` sequencial) aplicado a `Sale` — para não
 * reintroduzir o mesmo risco de timeout que motivou aquela correção.
 */
async function bulkUpdateSales(empresaId: string, rows: ReturnType<typeof toSaleData>[]): Promise<void> {
  if (rows.length === 0) return;

  const saiposSaleIds = rows.map((r) => r.saiposSaleId);
  const dateTimes = rows.map((r) => r.dateTime);
  const channels = rows.map((r) => r.channel);
  const platforms = rows.map((r) => r.platform);
  const formasPagamento = rows.map((r) => r.formaPagamento);
  const bairros = rows.map((r) => r.bairro);
  const valoresTotal = rows.map((r) => r.valorTotal);
  const cancelados = rows.map((r) => r.cancelado);

  await prisma.$executeRaw`
    UPDATE "Sale" AS s
    SET
      "dateTime" = v.date_time,
      "channel" = v.channel::"SaleChannel",
      "platform" = v.platform::"SalePlatform",
      "formaPagamento" = v.forma_pagamento::"PaymentMethod",
      "bairro" = v.bairro,
      "valorTotal" = v.valor_total,
      "cancelado" = v.cancelado
    FROM UNNEST(
      ${saiposSaleIds}::text[], ${dateTimes}::timestamp[], ${channels}::text[], ${platforms}::text[],
      ${formasPagamento}::text[], ${bairros}::text[], ${valoresTotal}::float8[], ${cancelados}::boolean[]
    ) AS v(saipos_sale_id, date_time, channel, platform, forma_pagamento, bairro, valor_total, cancelado)
    WHERE s."empresaId" = ${empresaId} AND s."saiposSaleId" = v.saipos_sale_id
  `;
}

/**
 * Faz upsert de cada venda da Saipos também em `Sale` (além do agregado
 * diário em `SalesEntry`, calculado por `syncSalesEntriesFromSaipos`) — sem
 * isso, as sub-abas de Vendas que leem de `Sale`/`SaleItem` (Faturamento,
 * Lançamentos, Acompanhamento de Vendas) ficam vazias mesmo com o sync
 * reportando sucesso, porque nunca foram alimentadas por essa tabela.
 *
 * Vendas canceladas entram normalmente (com `cancelado: true`), para
 * alimentar a tela de Acompanhamento de Vendas — só ficam de fora do
 * agregado de faturamento em `syncSalesEntriesFromSaipos`.
 *
 * Limitação conhecida (confirmada com o suporte da Saipos): o endpoint
 * `search_sales` não retorna item a item nem o garçom da venda, então
 * nenhum `SaleItem` é criado aqui — "Itens vendidos" e "Desempenho por
 * garçom" continuam vazios para vendas sincronizadas automaticamente.
 */
async function syncSalesFromSaipos(empresaId: string, salesData: ReturnType<typeof toSaleData>[]): Promise<void> {
  if (salesData.length === 0) return;

  const existing = await prisma.sale.findMany({
    where: { empresaId, saiposSaleId: { in: salesData.map((d) => d.saiposSaleId) } },
    select: { saiposSaleId: true },
  });
  const existingIds = new Set(existing.map((e) => e.saiposSaleId));
  const toCreate = salesData.filter((d) => !existingIds.has(d.saiposSaleId));
  const toUpdate = salesData.filter((d) => existingIds.has(d.saiposSaleId));

  if (toCreate.length > 0) {
    await prisma.sale.createMany({ data: toCreate, skipDuplicates: true });
  }
  if (toUpdate.length > 0) {
    await bulkUpdateSales(empresaId, toUpdate);
  }
}

function errorMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Erro inesperado ao sincronizar com a Saipos.";
}

function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Recalcula o lançamento diário (SalesEntry) de cada dia do intervalo a
 * partir das vendas da Saipos já salvas, substituindo o lançamento manual
 * do dia (se houver) por um lançamento com origem "SAIPOS".
 */
async function syncSalesEntriesFromSaipos(empresaId: string, range: { start: Date; end: Date }) {
  const sales = await prisma.saiposSale.findMany({
    where: { empresaId, shiftDate: { gte: startOfDayUtc(range.start), lte: range.end }, cancelado: false },
    select: { shiftDate: true, channel: true, valorTotal: true },
  });

  const byDay = new Map<string, typeof sales>();
  for (const sale of sales) {
    const key = startOfDayUtc(sale.shiftDate).toISOString();
    const list = byDay.get(key) ?? [];
    list.push(sale);
    byDay.set(key, list);
  }

  for (const [dayKey, daySales] of byDay) {
    const day = new Date(dayKey);
    const faturamentoDelivery = daySales.filter((s) => s.channel === "DELIVERY").reduce((sum, s) => sum + s.valorTotal, 0);
    const faturamentoSalao = daySales.filter((s) => s.channel !== "DELIVERY").reduce((sum, s) => sum + s.valorTotal, 0);
    const pedidosDelivery = daySales.filter((s) => s.channel === "DELIVERY").length;
    const pedidosSalao = daySales.filter((s) => s.channel === "SALAO").length;
    const pedidosBalcao = daySales.filter((s) => s.channel === "BALCAO").length;

    const data = {
      faturamentoDelivery,
      faturamentoSalao,
      pedidosDelivery,
      pedidosSalao,
      pedidosBalcao,
      source: "SAIPOS" as const,
      createdById: null,
    };

    const existing = await prisma.salesEntry.findFirst({
      where: { empresaId, date: day, periodType: "DIARIO" },
      select: { id: true },
    });

    if (existing) {
      await prisma.salesEntry.update({ where: { id: existing.id }, data });
    } else {
      await prisma.salesEntry.create({ data: { empresaId, date: day, periodType: "DIARIO", ...data } });
    }
  }
}
