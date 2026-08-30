-- AlterTable: Sale ganha rastreio de origem (manual/Saipos) e vínculo com a venda importada da Saipos.
ALTER TABLE "Sale" ADD COLUMN "source" "SalesEntrySource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Sale" ADD COLUMN "saiposSaleId" TEXT;
ALTER TABLE "Sale" ALTER COLUMN "createdById" DROP NOT NULL;

-- DropForeignKey / re-add without changing ON DELETE behavior, now that createdById is nullable.
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_createdById_fkey";
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_empresaId_saiposSaleId_key" ON "Sale"("empresaId", "saiposSaleId");
