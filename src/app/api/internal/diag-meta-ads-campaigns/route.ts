import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/vault";

// TEMPORARY, read-only diagnostic route. Delete after use.
// The sync succeeds (no error) but returns 0 records even though the user
// confirms there's an active campaign spending money right now. Calls the
// Graph API directly with wider parameters to see what's actually there:
// which ad account the token+id resolve to, the campaigns under it (with
// status), and insights at account level with a wider (90-day) window and
// no breakdowns, to isolate whether it's the breakdowns/campaign-level
// query or something about the account/token itself.
const FIX_TOKEN = "e2b7c1a9f5d38046a9c7e1f3b5d8206c9a7e1f4d8";
const EMPRESA_ID = "cmsndjpe00000497dhfcr8mzd";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: EMPRESA_ID },
    select: { metaAdsAccessToken: true, metaAdsAdAccountId: true, metaAdsGraphVersion: true },
  });
  if (!empresa?.metaAdsAccessToken || !empresa.metaAdsAdAccountId) {
    return NextResponse.json({ error: "conta não configurada" }, { status: 400 });
  }

  const accessToken = decryptSecret(empresa.metaAdsAccessToken);
  const accountId = empresa.metaAdsAdAccountId.replace(/^act_/, "");
  const graphVersion = empresa.metaAdsGraphVersion;
  const graphBase = `https://graph.facebook.com/${graphVersion}`;

  async function callGraph(path: string, params: Record<string, string>) {
    const url = new URL(`${graphBase}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  const now = new Date();
  const start90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const [accountInfo, campaigns, insightsAccountLevel, insightsCampaignLevelWide] = await Promise.all([
    callGraph(`/act_${accountId}`, { fields: "id,name,account_status,currency,timezone_name,business" }),
    callGraph(`/act_${accountId}/campaigns`, { fields: "id,name,status,effective_status,created_time", limit: "50" }),
    callGraph(`/act_${accountId}/insights`, {
      fields: "spend,impressions,clicks",
      time_range: JSON.stringify({ since: fmt(start90), until: fmt(now) }),
      level: "account",
    }),
    callGraph(`/act_${accountId}/insights`, {
      fields: "date_start,date_stop,campaign_id,campaign_name,spend,impressions,reach,clicks",
      time_range: JSON.stringify({ since: fmt(start90), until: fmt(now) }),
      level: "campaign",
    }),
  ]);

  return NextResponse.json({
    configuredAdAccountId: accountId,
    accountInfo: accountInfo.body,
    campaigns: campaigns.body,
    insightsAccountLevel90d: insightsAccountLevel.body,
    insightsCampaignLevel90dNoBreakdowns: insightsCampaignLevelWide.body,
  });
}
