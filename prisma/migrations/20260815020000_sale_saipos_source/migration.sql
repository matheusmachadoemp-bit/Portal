-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "source" "SalesEntrySource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Sale" ADD COLUMN "saiposSaleId" TEXT;
ALTER TABLE "Sale" ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_empresaId_saiposSaleId_key" ON "Sale"("empresaId", "saiposSaleId");
