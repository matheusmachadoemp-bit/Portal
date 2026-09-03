import { prisma } from "@/lib/prisma";
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
 * syncEmpresaMetaAdsInsights) dos últimos 30 dias, comparando com os 30 dias
 * anteriores. "connected" reflete só se existe alguma linha salva no
 * período — a conta pode estar configurada e ainda não ter sincronizado.
 */
export async function loadMetaAdsInsightSummary(empresaIds: string[]): Promise<MetaAdsInsightSummary> {
  const now = new Date();
  const start = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const prevStart = new Date(start.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.metaAdsInsight.findMany({
    where: { empresaId: { in: empresaIds }, dateStart: { gte: prevStart } },
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

  const atual = sumRange(rows.filter((r) => r.dateStart >= start));
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
