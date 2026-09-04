import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { defaultMetaAdsRange, loadActiveMetaAdsCampaigns, loadMetaAdsInsightSummary } from "@/lib/meta-ads-insights";

/**
 * Resumo de Meta Ads (cards + campanhas ativas) para um período customizado,
 * usado pelo seletor de datas na página Tráfego Pago > Meta Ads.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const empresaIds = empresaIdsForContext(ctx);

  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");

  const range = startParam && endParam ? { start: new Date(startParam), end: new Date(endParam) } : defaultMetaAdsRange();

  if (Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime()) || range.start > range.end) {
    return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  }

  const [summary, campaigns] = await Promise.all([
    loadMetaAdsInsightSummary(empresaIds, range),
    loadActiveMetaAdsCampaigns(empresaIds, range),
  ]);

  return NextResponse.json({ summary, campaigns });
}
