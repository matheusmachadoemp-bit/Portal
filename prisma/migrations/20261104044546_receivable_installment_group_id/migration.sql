-- AlterTable
ALTER TABLE "Receivable" ADD COLUMN     "installmentGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Receivable_installmentGroupId_idx" ON "Receivable"("installmentGroupId");
