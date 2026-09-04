import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, one-time fix route. Delete after use.
// The initial Meta Ads sync fetched insights without `time_increment=1`,
// so each row summed the entire 30-day window instead of representing a
// single day. This left dateStart/dateStop spanning the whole period,
// which broke the "mês atual x mês anterior" bucketing in
// loadMetaAdsInsightSummary. Removes those malformed rows so a fresh sync
// (now fixed to fetch daily rows) starts clean.
const FIX_TOKEN = "b7f2a9d4c6e1830f9a6d2c4e8b0173a5c9d6e2f4b1";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const confirm = req.nextUrl.searchParams.get("confirm") === "1";

  // Prisma doesn't support comparing two columns directly in `where`; fetch all and filter in JS instead.
  const all = await prisma.metaAdsInsight.findMany({
    select: { id: true, empresaId: true, dateStart: true, dateStop: true, campaignName: true, spend: true },
  });
  const toDelete = all.filter((r) => r.dateStart.getTime() !== r.dateStop.getTime());

  if (!confirm) {
    return NextResponse.json({
      dryRun: true,
      totalRows: all.length,
      malformedRows: toDelete.length,
      sample: toDelete.slice(0, 5),
      note: "Adicione &confirm=1 na URL para de fato apagar essas linhas.",
    });
  }

  const result = await prisma.metaAdsInsight.deleteMany({ where: { id: { in: toDelete.map((r) => r.id) } } });
  return NextResponse.json({ deleted: result.count });
}
