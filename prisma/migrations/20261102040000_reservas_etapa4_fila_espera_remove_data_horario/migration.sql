-- DropIndex
DROP INDEX "ReservationWaitlistEntry_empresaId_desiredDate_idx";

-- AlterTable
ALTER TABLE "ReservationWaitlistEntry" DROP COLUMN "desiredDate",
DROP COLUMN "desiredTime";

-- CreateIndex
CREATE INDEX "ReservationWaitlistEntry_empresaId_createdAt_idx" ON "ReservationWaitlistEntry"("empresaId", "createdAt");

