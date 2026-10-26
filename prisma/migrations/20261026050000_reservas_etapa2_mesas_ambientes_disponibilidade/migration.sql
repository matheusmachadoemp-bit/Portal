-- Reservas — Etapa 2 (mesas, ambientes e motor de disponibilidade; worktree
-- "reservas-etapa2"): `ReservationEnvironment` (Ambiente) + `ReservationTable` (Mesa, sem
-- `empresaId` próprio — escopada via `environmentId` -> `ReservationEnvironment.empresaId`,
-- mesmo padrão de "item filho de tabela-pai já multi-loja" já usado em `SaleItem`/`Sale`) +
-- `ReservationTableCombination`/`ReservationTableCombinationMember` (cadastro de combinações
-- pré-aprovadas de mesas) + `Reservation` (schema mínimo para o motor de disponibilidade
-- calcular ocupação — sem tela própria ainda, ver src/lib/reservas-disponibilidade.ts) +
-- `ReservationTableAssignment` (join N:N Reserva<->Mesa) + extensão de `ReservationSettings`
-- com os campos configuráveis do motor (duração padrão, limpeza, tolerância de atraso,
-- antecedência mínima/máxima, limite de grupo especial, intervalo entre horários).
--
-- Ver bloco de comentário completo no `prisma/schema.prisma` (logo acima de
-- `model ReservationEnvironment`) para o racional de cada decisão de modelagem.
--
-- Gerado com `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma
-- --script` contra um banco descartável já no estado "172 migrations aplicadas" (sem alteração
-- manual depois) — ver relatório da tarefa para o passo a passo da validação ao vivo (inclusive
-- a observação sobre o banco `template1` de `npx prisma dev` ser continuamente ressincronizado
-- pelo processo em background, o que exige usar um banco de aplicação separado, criado a partir
-- de `template0`, para rodar `migrate deploy`/`migrate diff` sem interferência).
-- CreateEnum
CREATE TYPE "ReservationTableStatus" AS ENUM ('DISPONIVEL', 'MANUTENCAO', 'INATIVA');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDENTE', 'CONFIRMADA', 'CLIENTE_CHEGOU', 'ACOMODADO', 'FINALIZADA', 'CANCELADA', 'NAO_COMPARECEU');

-- AlterTable
ALTER TABLE "ReservationSettings" ADD COLUMN     "cleaningMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "lateToleranceMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "maxAdvanceDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "minAdvanceMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "specialGroupThreshold" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "ReservationEnvironment" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationEnvironment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationTable" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "identificacao" TEXT NOT NULL,
    "capacityMin" INTEGER NOT NULL,
    "capacityMax" INTEGER NOT NULL,
    "status" "ReservationTableStatus" NOT NULL DEFAULT 'DISPONIVEL',
    "availableForReservation" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationTableCombination" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationTableCombination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationTableCombinationMember" (
    "id" TEXT NOT NULL,
    "combinationId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,

    CONSTRAINT "ReservationTableCombinationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "clienteId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "partySize" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationTableAssignment" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationTableAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservationEnvironment_empresaId_order_idx" ON "ReservationEnvironment"("empresaId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationEnvironment_empresaId_name_key" ON "ReservationEnvironment"("empresaId", "name");

-- CreateIndex
CREATE INDEX "ReservationTable_environmentId_order_idx" ON "ReservationTable"("environmentId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationTable_environmentId_identificacao_key" ON "ReservationTable"("environmentId", "identificacao");

-- CreateIndex
CREATE INDEX "ReservationTableCombination_empresaId_idx" ON "ReservationTableCombination"("empresaId");

-- CreateIndex
CREATE INDEX "ReservationTableCombinationMember_tableId_idx" ON "ReservationTableCombinationMember"("tableId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationTableCombinationMember_combinationId_tableId_key" ON "ReservationTableCombinationMember"("combinationId", "tableId");

-- CreateIndex
CREATE INDEX "Reservation_empresaId_date_idx" ON "Reservation"("empresaId", "date");

-- CreateIndex
CREATE INDEX "Reservation_environmentId_startTime_endTime_idx" ON "Reservation"("environmentId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "ReservationTableAssignment_tableId_idx" ON "ReservationTableAssignment"("tableId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationTableAssignment_reservationId_tableId_key" ON "ReservationTableAssignment"("reservationId", "tableId");

-- AddForeignKey
ALTER TABLE "ReservationEnvironment" ADD CONSTRAINT "ReservationEnvironment_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTable" ADD CONSTRAINT "ReservationTable_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "ReservationEnvironment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTableCombination" ADD CONSTRAINT "ReservationTableCombination_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTableCombinationMember" ADD CONSTRAINT "ReservationTableCombinationMember_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "ReservationTableCombination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTableCombinationMember" ADD CONSTRAINT "ReservationTableCombinationMember_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "ReservationTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "ReservationEnvironment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTableAssignment" ADD CONSTRAINT "ReservationTableAssignment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTableAssignment" ADD CONSTRAINT "ReservationTableAssignment_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "ReservationTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
