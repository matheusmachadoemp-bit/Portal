-- CreateEnum
CREATE TYPE "ReservationWaitlistStatus" AS ENUM ('AGUARDANDO', 'CONTATADO', 'CONVERTIDO_EM_RESERVA', 'CANCELADO', 'EXPIRADO');

-- CreateTable
CREATE TABLE "ReservationWaitlistEntry" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "desiredDate" TIMESTAMP(3) NOT NULL,
    "desiredTime" TEXT,
    "status" "ReservationWaitlistStatus" NOT NULL DEFAULT 'AGUARDANDO',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationWaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservationWaitlistEntry_empresaId_desiredDate_idx" ON "ReservationWaitlistEntry"("empresaId", "desiredDate");

-- CreateIndex
CREATE INDEX "ReservationWaitlistEntry_empresaId_status_idx" ON "ReservationWaitlistEntry"("empresaId", "status");

-- AddForeignKey
ALTER TABLE "ReservationWaitlistEntry" ADD CONSTRAINT "ReservationWaitlistEntry_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
