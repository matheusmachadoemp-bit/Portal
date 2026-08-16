import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, idempotent schema-fix route. Delete after use.
// Adds only the Meta Ads integration columns/tables (migration
// 20260815120000_meta_ads_integration) that are missing in this
// database, without touching anything else (e.g. Sale.createdById).
const FIX_TOKEN = "a3f9c1e6d84b7042f5c9e1a6d3b8f072c4e9a1d6f8b3c507";

const STATEMENTS = [
  `ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "metaAdsAccessToken" TEXT`,
  `ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "metaAdsAdAccountId" TEXT`,
  `ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "metaAdsAdAccountName" TEXT`,
  `ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "metaAdsGraphVersion" TEXT NOT NULL DEFAULT 'v21.0'`,
  `ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "metaAdsSyncEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "metaAdsLastSyncAt" TIMESTAMP(3)`,
  `DO $$ BEGIN
     CREATE TYPE "MarketingEntrySource" AS ENUM ('MANUAL', 'META_ADS');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "MarketingEntry" ADD COLUMN IF NOT EXISTS "source" "MarketingEntrySource" NOT NULL DEFAULT 'MANUAL'`,
  `ALTER TABLE "MarketingEntry" ALTER COLUMN "createdById" DROP NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "MetaAdsInsight" (
     "id" TEXT NOT NULL,
     "empresaId" TEXT NOT NULL,
     "dateStart" TIMESTAMP(3) NOT NULL,
     "dateStop" TIMESTAMP(3) NOT NULL,
     "campaignId" TEXT NOT NULL,
     "campaignName" TEXT NOT NULL,
     "publisherPlatform" TEXT NOT NULL DEFAULT '',
     "platformPosition" TEXT NOT NULL DEFAULT '',
     "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
     "impressions" INTEGER NOT NULL DEFAULT 0,
     "reach" INTEGER NOT NULL DEFAULT 0,
     "clicks" INTEGER NOT NULL DEFAULT 0,
     "linkClicks" INTEGER NOT NULL DEFAULT 0,
     "landingPageViews" INTEGER NOT NULL DEFAULT 0,
     "purchases" INTEGER NOT NULL DEFAULT 0,
     "purchaseValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
     "raw" JSONB,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "MetaAdsInsight_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE TABLE IF NOT EXISTS "MetaAdsSyncLog" (
     "id" TEXT NOT NULL,
     "empresaId" TEXT NOT NULL,
     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "finishedAt" TIMESTAMP(3),
     "status" TEXT NOT NULL,
     "recordsSynced" INTEGER NOT NULL DEFAULT 0,
     "errorMessage" TEXT,
     CONSTRAINT "MetaAdsSyncLog_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MetaAdsInsight_empresaId_dateStart_dateStop_campaignId_pu_key" ON "MetaAdsInsight"("empresaId", "dateStart", "dateStop", "campaignId", "publisherPlatform", "platformPosition")`,
  `CREATE INDEX IF NOT EXISTS "MetaAdsInsight_empresaId_dateStart_idx" ON "MetaAdsInsight"("empresaId", "dateStart")`,
  `CREATE INDEX IF NOT EXISTS "MetaAdsSyncLog_empresaId_startedAt_idx" ON "MetaAdsSyncLog"("empresaId", "startedAt")`,
  `DO $$ BEGIN
     ALTER TABLE "MetaAdsInsight" ADD CONSTRAINT "MetaAdsInsight_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "MetaAdsSyncLog" ADD CONSTRAINT "MetaAdsSyncLog_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: { statement: string; ok: boolean; error?: string }[] = [];
  for (const sql of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.push({ statement: sql.slice(0, 60), ok: true });
    } catch (err) {
      results.push({ statement: sql.slice(0, 60), ok: false, error: String(err) });
    }
  }

  return NextResponse.json({ results });
}
