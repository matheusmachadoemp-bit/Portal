import type { MetaAdsInsightRow } from "@/lib/meta-ads-client";
import type { Prisma } from "@prisma/client";

function actionValue(actions: { action_type: string; value: string }[] | undefined, type: string): number {
  const found = actions?.find((a) => a.action_type === type);
  return found ? Number(found.value) || 0 : 0;
}

export function toMetaAdsInsightData(empresaId: string, row: MetaAdsInsightRow): Prisma.MetaAdsInsightUncheckedCreateInput {
  return {
    empresaId,
    dateStart: new Date(`${row.date_start}T00:00:00.000Z`),
    dateStop: new Date(`${row.date_stop}T00:00:00.000Z`),
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    publisherPlatform: row.publisher_platform ?? "",
    platformPosition: row.platform_position ?? "",
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    reach: Number(row.reach) || 0,
    clicks: Number(row.clicks) || 0,
    linkClicks: actionValue(row.actions, "link_click"),
    landingPageViews: actionValue(row.actions, "landing_page_view"),
    purchases: actionValue(row.actions, "purchase"),
    purchaseValue: actionValue(row.action_values, "purchase"),
    raw: row as unknown as Prisma.InputJsonValue,
  };
}
