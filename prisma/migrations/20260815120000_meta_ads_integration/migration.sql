-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN "metaAdsAccessToken" TEXT;
ALTER TABLE "Empresa" ADD COLUMN "metaAdsAdAccountId" TEXT;
ALTER TABLE "Empresa" ADD COLUMN "metaAdsAdAccountName" TEXT;
ALTER TABLE "Empresa" ADD COLUMN "metaAdsGraphVersion" TEXT NOT NULL DEFAULT 'v21.0';
ALTER TABLE "Empresa" ADD COLUMN "metaAdsSyncEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Empresa" ADD COLUMN "metaAdsLastSyncAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "MarketingEntrySource" AS ENUM ('MANUAL', 'META_ADS');

-- AlterTable
ALTER TABLE "MarketingEntry" ADD COLUMN "source" "MarketingEntrySource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "MarketingEntry" ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MetaAdsInsight" (
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
);

-- CreateTable
CREATE TABLE "MetaAdsSyncLog" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "MetaAdsSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdsInsight_empresaId_dateStart_dateStop_campaignId_pu_key" ON "MetaAdsInsight"("empresaId", "dateStart", "dateStop", "campaignId", "publisherPlatform", "platformPosition");

-- CreateIndex
CREATE INDEX "MetaAdsInsight_empresaId_dateStart_idx" ON "MetaAdsInsight"("empresaId", "dateStart");

-- CreateIndex
CREATE INDEX "MetaAdsSyncLog_empresaId_startedAt_idx" ON "MetaAdsSyncLog"("empresaId", "startedAt");

-- AddForeignKey
ALTER TABLE "MetaAdsInsight" ADD CONSTRAINT "MetaAdsInsight_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdsSyncLog" ADD CONSTRAINT "MetaAdsSyncLog_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
