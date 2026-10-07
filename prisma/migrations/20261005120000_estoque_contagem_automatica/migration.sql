-- DropForeignKey
ALTER TABLE "StockCount" DROP CONSTRAINT "StockCount_createdById_fkey";

-- AlterTable
ALTER TABLE "StockCount" ADD COLUMN     "prazo" TIMESTAMP(3),
ADD COLUMN     "scheduleId" TEXT,
ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StockCountSchedule" ADD COLUMN     "horarioLimite" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_scheduleId_dataContagem_key" ON "StockCount"("scheduleId", "dataContagem");

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "StockCountSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
