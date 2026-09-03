import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, read-only diagnostic route. Delete after use.
// User says the Meta Ads account is already connected, but the Tráfego
// Pago > Meta Ads tab shows "ainda não sincronizou dados". Checks whether
// the account is actually configured and whether any sync has run/succeeded,
// without exposing the access token itself.
const FIX_TOKEN = "c8e1a3f7d5b29046a9c7e1f3b5d8206c9a7e1f4b6";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const empresas = await prisma.empresa.findMany({
    select: {
      id: true,
      name: true,
      metaAdsAccessToken: true,
      metaAdsAdAccountId: true,
      metaAdsAdAccountName: true,
      metaAdsSyncEnabled: true,
      metaAdsLastSyncAt: true,
      metaAdsInstagramAccountId: true,
      metaAdsInstagramUsername: true,
    },
  });

  const result = await Promise.all(
    empresas.map(async (e) => {
      const [insightCount, lastLogs] = await Promise.all([
        prisma.metaAdsInsight.count({ where: { empresaId: e.id } }),
        prisma.metaAdsSyncLog.findMany({
          where: { empresaId: e.id },
          orderBy: { startedAt: "desc" },
          take: 3,
          select: { status: true, startedAt: true, finishedAt: true, recordsSynced: true, errorMessage: true },
        }),
      ]);
      return {
        empresaId: e.id,
        empresaNome: e.name,
        temToken: !!e.metaAdsAccessToken,
        adAccountId: e.metaAdsAdAccountId,
        adAccountName: e.metaAdsAdAccountName,
        syncEnabled: e.metaAdsSyncEnabled,
        lastSyncAt: e.metaAdsLastSyncAt,
        instagramAccountId: e.metaAdsInstagramAccountId,
        instagramUsername: e.metaAdsInstagramUsername,
        insightCount,
        lastSyncLogs: lastLogs,
      };
    })
  );

  return NextResponse.json({ empresas: result });
}
