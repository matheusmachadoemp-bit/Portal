import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadMetaAdsInsightSummary } from "@/lib/meta-ads-insights";

// TEMPORARY, read-only diagnostic route. Delete after use.
// The sync reported 42 records imported, but the Tráfego Pago > Meta Ads
// tab still shows "ainda não sincronizou dados" even after a hard reload.
// Runs the exact same summary function the page uses, plus raw counts per
// empresa, to see where the mismatch is (empresaId, date range, etc.).
const FIX_TOKEN = "a9c3e7f1d5b28046a9c7e1f3b5d8206c9a7e1f6f0";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const empresas = await prisma.empresa.findMany({ select: { id: true, name: true } });

  const perEmpresa = await Promise.all(
    empresas.map(async (e) => {
      const totalInsights = await prisma.metaAdsInsight.count({ where: { empresaId: e.id } });
      const sample = await prisma.metaAdsInsight.findMany({
        where: { empresaId: e.id },
        orderBy: { dateStart: "desc" },
        take: 3,
        select: { dateStart: true, dateStop: true, campaignName: true, spend: true, impressions: true, publisherPlatform: true },
      });
      const summary = await loadMetaAdsInsightSummary([e.id]);
      return { empresaId: e.id, empresaNome: e.name, totalInsights, sample, summary };
    })
  );

  return NextResponse.json({ now: new Date().toISOString(), perEmpresa });
}
