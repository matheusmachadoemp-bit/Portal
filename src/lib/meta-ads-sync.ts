import { randomUUID } from "crypto";
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

/**
 * Cria/atualiza as linhas de MetaAdsInsight de um lote já buscado da Graph
 * API, numa única instrução SQL (INSERT ... ON CONFLICT DO UPDATE via
 * UNNEST). Uma versão anterior fazia isso com um SELECT de "já existe?" e
 * depois um `$transaction` com um `update()` por linha — rápido na primeira
 * sincronização (tudo era `create`), mas ao rodar de novo sobre um período já
 * sincronizado (centenas de `update()` sequenciais, cada um uma viagem
 * separada ao banco) ficava lento a ponto de estourar o tempo da função
 * serverless. O upsert em lote resolve tudo numa única ida ao banco,
 * independente de quantas linhas já existirem.
 */
async function upsertMetaAdsInsightRows(empresaId: string, insightsData: ReturnType<typeof toMetaAdsInsightData>[]) {
  if (insightsData.length === 0) return;

  const n = insightsData.length;
  const ids = insightsData.map(() => randomUUID());
  const empresaIds = new Array(n).fill(empresaId);
  const dateStarts = insightsData.map((d) => new Date(d.dateStart));
  const dateStops = insightsData.map((d) => new Date(d.dateStop));
  const campaignIds = insightsData.map((d) => d.campaignId);
  const campaignNames = insightsData.map((d) => d.campaignName);
  const publisherPlatforms = insightsData.map((d) => d.publisherPlatform ?? "");
  const platformPositions = insightsData.map((d) => d.platformPosition ?? "");
  const spends = insightsData.map((d) => d.spend ?? 0);
  const impressions = insightsData.map((d) => d.impressions ?? 0);
  const reach = insightsData.map((d) => d.reach ?? 0);
  const clicks = insightsData.map((d) => d.clicks ?? 0);
  const linkClicks = insightsData.map((d) => d.linkClicks ?? 0);
  const landingPageViews = insightsData.map((d) => d.landingPageViews ?? 0);
  const purchases = insightsData.map((d) => d.purchases ?? 0);
  const purchaseValues = insightsData.map((d) => d.purchaseValue ?? 0);
  const raws = insightsData.map((d) => JSON.stringify(d.raw ?? null));

  await prisma.$executeRaw`
    INSERT INTO "MetaAdsInsight" (
      id, "empresaId", "dateStart", "dateStop", "campaignId", "campaignName",
      "publisherPlatform", "platformPosition", spend, impressions, reach, clicks,
      "linkClicks", "landingPageViews", purchases, "purchaseValue", raw
    )
    SELECT id, empresa_id, date_start, date_stop, campaign_id, campaign_name,
           publisher_platform, platform_position, spend, impressions, reach, clicks,
           link_clicks, landing_page_views, purchases, purchase_value, raw_txt::jsonb
    FROM UNNEST(
      ${ids}::text[], ${empresaIds}::text[], ${dateStarts}::timestamp[], ${dateStops}::timestamp[],
      ${campaignIds}::text[], ${campaignNames}::text[], ${publisherPlatforms}::text[], ${platformPositions}::text[],
      ${spends}::float8[], ${impressions}::int[], ${reach}::int[], ${clicks}::int[],
      ${linkClicks}::int[], ${landingPageViews}::int[], ${purchases}::int[], ${purchaseValues}::float8[], ${raws}::text[]
    ) AS t(id, empresa_id, date_start, date_stop, campaign_id, campaign_name,
           publisher_platform, platform_position, spend, impressions, reach, clicks,
           link_clicks, landing_page_views, purchases, purchase_value, raw_txt)
    ON CONFLICT ("empresaId", "dateStart", "dateStop", "campaignId", "publisherPlatform", "platformPosition")
    DO UPDATE SET
      "campaignName" = EXCLUDED."campaignName",
      spend = EXCLUDED.spend,
      impressions = EXCLUDED.impressions,
      reach = EXCLUDED.reach,
      clicks = EXCLUDED.clicks,
      "linkClicks" = EXCLUDED."linkClicks",
      "landingPageViews" = EXCLUDED."landingPageViews",
      purchases = EXCLUDED.purchases,
      "purchaseValue" = EXCLUDED."purchaseValue",
      raw = EXCLUDED.raw
  `;
}

/**
 * Sincroniza os insights de campanhas do Meta Ads de uma empresa para um
 * intervalo de datas, salva os dados brutos por campanha em MetaAdsInsight
 * e atualiza o lançamento mensal de Tráfego Pago (MarketingEntry) com os
 * totais do mês corrente, sem sobrescrever campos preenchidos manualmente
 * (seguidores, curtidas, comentários, observações etc.).
 *
 * O período pedido deve caber numa única chamada da Graph API (até ~30 dias
 * com granularidade diária) — tanto pelo limite de volume de dados da própria
 * Graph API quanto pelo tempo de execução da função serverless. Para trazer
 * um histórico maior, o chamador (rota de sync) deve fazer várias chamadas
 * menores em sequência; ver o botão "Sincronizar histórico completo" em
 * Configurações, que faz esse loop no navegador.
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
  await upsertMetaAdsInsightRows(empresa.id, insightsData);

  await syncMarketingEntryFromMetaAds(empresa.id, range);

  if (empresa.metaAdsInstagramAccountId) {
    await syncInstagramFollowers(empresa.id, token, empresa.metaAdsInstagramAccountId, empresa.metaAdsGraphVersion);
  }

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
