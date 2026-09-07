-- AlterTable
ALTER TABLE "Receiving" ADD COLUMN     "numeroNotaInformado" TEXT,
ADD COLUMN     "valorNotaInformado" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "purchaseId" TEXT;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

