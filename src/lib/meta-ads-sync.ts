import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/vault";
import { fetchMetaAdsInsights } from "@/lib/meta-ads-client";
import { toMetaAdsInsightData } from "@/lib/meta-ads-mapper";
import type { Empresa } from "@prisma/client";

export type MetaAdsSyncOutcome = { ok: true; recordsSynced: number } | { ok: false; error: string };

type SyncableEmpresa = Pick<Empresa, "id" | "metaAdsAccessToken" | "metaAdsAdAccountId" | "metaAdsGraphVersion">;

/**
 * Sincroniza os insights de campanhas do Meta Ads de uma empresa para um
 * intervalo de datas, salva os dados brutos por campanha em MetaAdsInsight
 * e atualiza o lançamento mensal de Tráfego Pago (MarketingEntry) com os
 * totais do mês corrente, sem sobrescrever campos preenchidos manualmente
 * (seguidores, curtidas, comentários, observações etc.).
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
  const result = await fetchMetaAdsInsights(token, empresa.metaAdsAdAccountId, empresa.metaAdsGraphVersion, range);

  if (!result.ok) {
    await prisma.metaAdsSyncLog.update({
      where: { id: log.id },
      data: { status: "ERRO", errorMessage: result.error, finishedAt: new Date() },
    });
    return { ok: false, error: result.error };
  }

  const insightsData = result.rows.map((row) => toMetaAdsInsightData(empresa.id, row));

  if (insightsData.length > 0) {
    const compositeKey = (d: (typeof insightsData)[number]) =>
      [new Date(d.dateStart).getTime(), new Date(d.dateStop).getTime(), d.campaignId, d.publisherPlatform ?? "", d.platformPosition ?? ""].join(
        "|"
      );

    const existing = await prisma.metaAdsInsight.findMany({
      where: { empresaId: empresa.id, dateStart: { gte: range.start, lte: range.end } },
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

  await syncMarketingEntryFromMetaAds(empresa.id, range);

  await prisma.$transaction([
    prisma.metaAdsSyncLog.update({
      where: { id: log.id },
      data: { status: "SUCESSO", recordsSynced: result.rows.length, finishedAt: new Date() },
    }),
    prisma.empresa.update({ where: { id: empresa.id }, data: { metaAdsLastSyncAt: new Date() } }),
  ]);

  return { ok: true, recordsSynced: result.rows.length };
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
