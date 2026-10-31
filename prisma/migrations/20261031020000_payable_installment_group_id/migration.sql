-- AlterTable
ALTER TABLE "Payable" ADD COLUMN     "installmentGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Payable_installmentGroupId_idx" ON "Payable"("installmentGroupId");
