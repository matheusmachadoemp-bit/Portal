import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/vault";
import { fetchMetaAdsCampaigns } from "@/lib/meta-ads-client";
import { safeDiv } from "@/lib/calc";

const WINDOW_DAYS = 30;

export type MetaAdsInsightSummary = {
  connected: boolean;
  impressoes: number;
  alcance: number;
  cliques: number;
  cliquesLink: number;
  cliquesLinkFacebook: number;
  cliquesLinkInstagram: number;
  visualizacoesPaginaDestino: number;
  compras: number;
  valorCompras: number;
  valorInvestido: number;
  ctr: number;
  cpc: number;
  custoPorCompra: number;
  roas: number;
  anterior: {
    valorInvestido: number;
    valorCompras: number;
    impressoes: number;
    alcance: number;
    cliquesLink: number;
    compras: number;
  };
};

export type MetaAdsDateRange = { start: Date; end: Date };

/** Últimos 30 dias, terminando hoje — período padrão usado quando nenhum é informado. */
export function defaultMetaAdsRange(): MetaAdsDateRange {
  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { start, end };
}

const EMPTY_TOTALS = {
  spend: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  linkClicks: 0,
  linkClicksFacebook: 0,
  linkClicksInstagram: 0,
  landingPageViews: 0,
  purchases: 0,
  purchaseValue: 0,
};

function sumRange(
  rows: { spend: number; impressions: number; reach: number; clicks: number; linkClicks: number; landingPageViews: number; purchases: number; purchaseValue: number; publisherPlatform: string }[]
) {
  const totals = { ...EMPTY_TOTALS };
  for (const r of rows) {
    totals.spend += r.spend;
    totals.impressions += r.impressions;
    totals.reach += r.reach;
    totals.clicks += r.clicks;
    totals.linkClicks += r.linkClicks;
    if (r.publisherPlatform === "facebook") totals.linkClicksFacebook += r.linkClicks;
    if (r.publisherPlatform === "instagram") totals.linkClicksInstagram += r.linkClicks;
    totals.landingPageViews += r.landingPageViews;
    totals.purchases += r.purchases;
    totals.purchaseValue += r.purchaseValue;
  }
  return totals;
}

/**
 * Agrega os insights do Meta Ads (já sincronizados via
 * syncEmpresaMetaAdsInsights) do período informado, comparando com um
 * período anterior de mesma duração. "connected" reflete só se existe
 * alguma linha salva no período — a conta pode estar configurada e ainda
 * não ter sincronizado.
 */
export async function loadMetaAdsInsightSummary(
  empresaIds: string[],
  range: MetaAdsDateRange = defaultMetaAdsRange()
): Promise<MetaAdsInsightSummary> {
  const { start, end } = range;
  const durationMs = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - durationMs);

  const rows = await prisma.metaAdsInsight.findMany({
    where: { empresaId: { in: empresaIds }, dateStart: { gte: prevStart, lte: end } },
    select: {
      dateStart: true,
      spend: true,
      impressions: true,
      reach: true,
      clicks: true,
      linkClicks: true,
      landingPageViews: true,
      purchases: true,
      purchaseValue: true,
      publisherPlatform: true,
    },
  });

  const atual = sumRange(rows.filter((r) => r.dateStart >= start && r.dateStart <= end));
  const anterior = sumRange(rows.filter((r) => r.dateStart >= prevStart && r.dateStart < start));

  return {
    connected: rows.length > 0,
    impressoes: atual.impressions,
    alcance: atual.reach,
    cliques: atual.clicks,
    cliquesLink: atual.linkClicks,
    cliquesLinkFacebook: atual.linkClicksFacebook,
    cliquesLinkInstagram: atual.linkClicksInstagram,
    visualizacoesPaginaDestino: atual.landingPageViews,
    compras: atual.purchases,
    valorCompras: atual.purchaseValue,
    valorInvestido: atual.spend,
    ctr: safeDiv(atual.linkClicks, atual.impressions) * 100,
    cpc: safeDiv(atual.spend, atual.linkClicks),
    custoPorCompra: safeDiv(atual.spend, atual.purchases),
    roas: safeDiv(atual.purchaseValue, atual.spend),
    anterior: {
      valorInvestido: anterior.spend,
      valorCompras: anterior.purchaseValue,
      impressoes: anterior.impressions,
      alcance: anterior.reach,
      cliquesLink: anterior.linkClicks,
      compras: anterior.purchases,
    },
  };
}

export type MetaAdsCampaignPerformance = {
  campaignId: string;
  campaignName: string;
  status: string;
  valorInvestido: number;
  impressoes: number;
  cliquesLink: number;
  compras: number;
  valorCompras: number;
  roas: number;
  ctr: number;
};

/**
 * Desempenho por campanha no período informado, cruzado com o status atual
 * (ativa, pausada etc.) buscado ao vivo na Graph API. Só retorna campanhas
 * com status "ACTIVE" no momento da consulta — campanhas pausadas/encerradas
 * não aparecem, mesmo que tenham dados no período.
 */
export async function loadActiveMetaAdsCampaigns(
  empresaIds: string[],
  range: MetaAdsDateRange = defaultMetaAdsRange()
): Promise<MetaAdsCampaignPerformance[]> {
  const empresas = await prisma.empresa.findMany({
    where: {
      id: { in: empresaIds },
      metaAdsAccessToken: { not: null },
      metaAdsAdAccountId: { not: null },
    },
    select: { id: true, metaAdsAccessToken: true, metaAdsAdAccountId: true, metaAdsGraphVersion: true },
  });

  if (empresas.length === 0) return [];

  const statusByCampaignId = new Map<string, { name: string; status: string }>();
  await Promise.all(
    empresas.map(async (empresa) => {
      if (!empresa.metaAdsAccessToken || !empresa.metaAdsAdAccountId) return;
      const token = decryptSecret(empresa.metaAdsAccessToken);
      const result = await fetchMetaAdsCampaigns(token, empresa.metaAdsAdAccountId, empresa.metaAdsGraphVersion);
      if (!result.ok) return;
      for (const c of result.campaigns) {
        statusByCampaignId.set(c.id, { name: c.name, status: c.status });
      }
    })
  );

  const activeIds = [...statusByCampaignId.entries()].filter(([, v]) => v.status === "ACTIVE").map(([id]) => id);
  if (activeIds.length === 0) return [];

  const rows = await prisma.metaAdsInsight.findMany({
    where: { empresaId: { in: empresaIds }, campaignId: { in: activeIds }, dateStart: { gte: range.start, lte: range.end } },
    select: {
      campaignId: true,
      campaignName: true,
      spend: true,
      impressions: true,
      linkClicks: true,
      purchases: true,
      purchaseValue: true,
    },
  });

  const byCampaign = new Map<string, MetaAdsCampaignPerformance>();
  for (const id of activeIds) {
    const status = statusByCampaignId.get(id);
    byCampaign.set(id, {
      campaignId: id,
      campaignName: status?.name ?? "Campanha",
      status: status?.status ?? "ACTIVE",
      valorInvestido: 0,
      impressoes: 0,
      cliquesLink: 0,
      compras: 0,
      valorCompras: 0,
      roas: 0,
      ctr: 0,
    });
  }

  for (const r of rows) {
    const acc = byCampaign.get(r.campaignId);
    if (!acc) continue;
    acc.valorInvestido += r.spend;
    acc.impressoes += r.impressions;
    acc.cliquesLink += r.linkClicks;
    acc.compras += r.purchases;
    acc.valorCompras += r.purchaseValue;
    if (r.campaignName) acc.campaignName = r.campaignName;
  }

  const list = [...byCampaign.values()];
  for (const c of list) {
    c.roas = safeDiv(c.valorCompras, c.valorInvestido);
    c.ctr = safeDiv(c.cliquesLink, c.impressoes) * 100;
  }

  return list.sort((a, b) => b.valorInvestido - a.valorInvestido);
}
