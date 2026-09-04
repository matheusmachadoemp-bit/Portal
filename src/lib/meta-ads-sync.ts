import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/vault";
import { fetchMetaAdsInsights, fetchInstagramFollowers } from "@/lib/meta-ads-client";
import { toMetaAdsInsightData } from "@/lib/meta-ads-mapper";
import type { Empresa } from "@prisma/client";

export type MetaAdsSyncOutcome = { ok: true; recordsSynced: number } | { ok: false; error: string };

type SyncableEmpresa = Pick<
  Empresa,
  | "id"
  | "metaAdsAccessToken"
  | "metaAdsAdAccountId"
  | "metaAdsGraphVersion"
  | "metaAdsInstagramAccountId"
>;

// A Graph API recusa pedidos de insights diários com muitos meses de uma vez
// ("Please reduce the amount of data you're asking for"). Buscar em pedaços
// de até 30 dias por vez evita isso — o mesmo tamanho já usado com sucesso
// na sincronização incremental normal.
const CHUNK_DAYS = 30;

function chunkDateRange(range: { start: Date; end: Date }): { start: Date; end: Date }[] {
  const chunks: { start: Date; end: Date }[] = [];
  let chunkStart = new Date(range.start);
  while (chunkStart <= range.end) {
    const chunkEnd = new Date(
      Math.min(chunkStart.getTime() + (CHUNK_DAYS - 1) * 24 * 60 * 60 * 1000, range.end.getTime())
    );
    chunks.push({ start: chunkStart, end: chunkEnd });
    chunkStart = new Date(chunkEnd.getTime() + 24 * 60 * 60 * 1000);
  }
  return chunks;
}

/** Cria/atualiza as linhas de MetaAdsInsight de um lote já buscado da Graph API. */
async function upsertMetaAdsInsightRows(empresaId: string, insightsData: ReturnType<typeof toMetaAdsInsightData>[]) {
  if (insightsData.length === 0) return;

  const compositeKey = (d: (typeof insightsData)[number]) =>
    [new Date(d.dateStart).getTime(), new Date(d.dateStop).getTime(), d.campaignId, d.publisherPlatform ?? "", d.platformPosition ?? ""].join(
      "|"
    );

  const dateStarts = insightsData.map((d) => new Date(d.dateStart).getTime());
  const existing = await prisma.metaAdsInsight.findMany({
    where: {
      empresaId,
      dateStart: { gte: new Date(Math.min(...dateStarts)), lte: new Date(Math.max(...dateStarts)) },
    },
    select: { dateStart: true, dateStop: true, campaignId: true, publisherPlatform: true, platformPosition: true },
  });
  const existingKeys = new Set(
    existing.map((e) =>
      [e.dateStart.getTime(), e.dateStop.getTime(), e.campaignId, e.publisherPlatform ?? "", e.platformPosition ?? ""].join("|")
    )
  );

  const toCreate = insightsData.filter((d) => !existingKeys.has(compositeKey(d)));
  const toUpdate = insightsData.filter((d) => existingKeys.has(compositeKey(d)));

  if (toCreate.length > 0) {
    await prisma.metaAdsInsight.createMany({ data: toCreate, skipDuplicates: true });
  }
  if (toUpdate.length > 0) {
    await prisma.$transaction(
      toUpdate.map((data) =>
        prisma.metaAdsInsight.update({
          where: {
            empresaId_dateStart_dateStop_campaignId_publisherPlatform_platformPosition: {
              empresaId: data.empresaId,
              dateStart: data.dateStart,
              dateStop: data.dateStop,
              campaignId: data.campaignId,
              publisherPlatform: data.publisherPlatform ?? "",
              platformPosition: data.platformPosition ?? "",
            },
          },
          data,
        })
      )
    );
  }
}

/**
 * Sincroniza os insights de campanhas do Meta Ads de uma empresa para um
 * intervalo de datas, salva os dados brutos por campanha em MetaAdsInsight
 * e atualiza o lançamento mensal de Tráfego Pago (MarketingEntry) com os
 * totais do mês corrente, sem sobrescrever campos preenchidos manualmente
 * (seguidores, curtidas, comentários, observações etc.). Períodos longos são
 * buscados em pedaços de 30 dias, um de cada vez, para não estourar o limite
 * de volume de dados de uma única chamada da Graph API — o progresso de cada
 * pedaço é salvo antes de buscar o próximo, então uma falha no meio não perde
 * o que já foi sincronizado.
 */
export async function syncEmpresaMetaAdsInsights(
  empresa: SyncableEmpresa,
  range: { start: Date; end: Date }
): Promise<MetaAdsSyncOutcome> {
  if (!empresa.metaAdsAccessToken || !empresa.metaAdsAdAccountId) {
    return { ok: false, error: "Token ou conta de anúncios da Meta não configurados para esta loja." };
  }

  const log = await prisma.metaAdsSyncLog.create({
    data: { empresaId: empresa.id, status: "EM_ANDAMENTO" },
  });

  const token = decryptSecret(empresa.metaAdsAccessToken);
  let totalRecords = 0;

  for (const chunk of chunkDateRange(range)) {
    const result = await fetchMetaAdsInsights(token, empresa.metaAdsAdAccountId, empresa.metaAdsGraphVersion, chunk);

    if (!result.ok) {
      await prisma.metaAdsSyncLog.update({
        where: { id: log.id },
        data: { status: "ERRO", errorMessage: result.error, recordsSynced: totalRecords, finishedAt: new Date() },
      });
      return { ok: false, error: result.error };
    }

    const insightsData = result.rows.map((row) => toMetaAdsInsightData(empresa.id, row));
    await upsertMetaAdsInsightRows(empresa.id, insightsData);
    totalRecords += result.rows.length;
  }

  await syncMarketingEntryFromMetaAds(empresa.id, range);

  if (empresa.metaAdsInstagramAccountId) {
    await syncInstagramFollowers(empresa.id, token, empresa.metaAdsInstagramAccountId, empresa.metaAdsGraphVersion);
  }

  await prisma.$transaction([
    prisma.metaAdsSyncLog.update({
      where: { id: log.id },
      data: { status: "SUCESSO", recordsSynced: totalRecords, finishedAt: new Date() },
    }),
    prisma.empresa.update({ where: { id: empresa.id }, data: { metaAdsLastSyncAt: new Date() } }),
  ]);

  return { ok: true, recordsSynced: totalRecords };
}

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * Recalcula os campos derivados de anúncios do lançamento mensal de
 * Tráfego Pago (investimento, receita, pedidos, visitas, conversões,
 * alcance e impressões) a partir dos insights do Meta Ads já salvos,
 * agregando por mês de referência.
 */
async function syncMarketingEntryFromMetaAds(empresaId: string, range: { start: Date; end: Date }) {
  const insights = await prisma.metaAdsInsight.findMany({
    where: { empresaId, dateStart: { gte: range.start, lte: range.end } },
    select: {
      dateStart: true,
      spend: true,
      purchases: true,
      purchaseValue: true,
      landingPageViews: true,
      reach: true,
      impressions: true,
    },
  });

  const byMonth = new Map<string, typeof insights>();
  for (const row of insights) {
    const key = startOfMonthUtc(row.dateStart).toISOString();
    const list = byMonth.get(key) ?? [];
    list.push(row);
    byMonth.set(key, list);
  }

  for (const [monthKey, rows] of byMonth) {
    const month = new Date(monthKey);
    const totals = rows.reduce(
      (acc, r) => ({
        spend: acc.spend + r.spend,
        purchaseValue: acc.purchaseValue + r.purchaseValue,
        purchases: acc.purchases + r.purchases,
        landingPageViews: acc.landingPageViews + r.landingPageViews,
        reach: acc.reach + r.reach,
        impressions: acc.impressions + r.impressions,
      }),
      { spend: 0, purchaseValue: 0, purchases: 0, landingPageViews: 0, reach: 0, impressions: 0 }
    );

    const data = {
      investimentoTrafego: totals.spend,
      receitaTrafego: totals.purchaseValue,
      pedidosCampanha: totals.purchases,
      visitasSite: totals.landingPageViews,
      conversoes: totals.purchases,
      alcance: totals.reach,
      impressoes: totals.impressions,
    };

    const existing = await prisma.marketingEntry.findFirst({
      where: { empresaId, date: month },
      select: { id: true, source: true },
    });

    if (existing) {
      await prisma.marketingEntry.update({ where: { id: existing.id }, data: { ...data, source: "META_ADS" } });
    } else {
      await prisma.marketingEntry.create({ data: { empresaId, date: month, source: "META_ADS", ...data } });
    }
  }
}

/**
 * Busca o número atual de seguidores do Instagram e atualiza o lançamento
 * do mês corrente de Tráfego Pago: `seguidoresFim` sempre reflete a última
 * contagem; `seguidoresInicio` só é definido na criação do lançamento (como
 * base para o cálculo de crescimento), nunca sobrescrito depois.
 */
async function syncInstagramFollowers(
  empresaId: string,
  token: string,
  instagramAccountId: string,
  graphVersion: string
) {
  const result = await fetchInstagramFollowers(token, instagramAccountId, graphVersion);
  if (!result.ok) return;

  await prisma.empresa.update({
    where: { id: empresaId },
    data: { metaAdsInstagramUsername: result.username || null },
  });

  const month = startOfMonthUtc(new Date());
  const existing = await prisma.marketingEntry.findFirst({
    where: { empresaId, date: month },
    select: { id: true },
  });

  if (existing) {
    await prisma.marketingEntry.update({
      where: { id: existing.id },
      data: { seguidoresFim: result.followersCount },
    });
  } else {
    await prisma.marketingEntry.create({
      data: {
        empresaId,
        date: month,
        source: "META_ADS",
        seguidoresInicio: result.followersCount,
        seguidoresFim: result.followersCount,
      },
    });
  }
}
