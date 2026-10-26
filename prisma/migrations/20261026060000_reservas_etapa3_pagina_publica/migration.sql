-- Reservas Etapa 3 (página pública /reservar/[empresaKey]): código curto de confirmação +
-- contato do cliente direto em Reservation (ver comentário no schema acima de `Reservation`/
-- `Cliente.reservations` para o racional de não forçar criação de um `Cliente` completo ainda).
-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "confirmationCode" TEXT NOT NULL,
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_confirmationCode_key" ON "Reservation"("confirmationCode");
