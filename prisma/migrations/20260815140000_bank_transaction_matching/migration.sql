-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN "matchedType" TEXT;
ALTER TABLE "BankTransaction" ADD COLUMN "matchedId" TEXT;

-- CreateIndex
CREATE INDEX "BankTransaction_matchedType_matchedId_idx" ON "BankTransaction"("matchedType", "matchedId");
