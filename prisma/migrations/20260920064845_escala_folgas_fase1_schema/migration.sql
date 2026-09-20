-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('PLANEJADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "DayOffTypeKind" AS ENUM ('FOLGA', 'FERIAS', 'AFASTAMENTO');

-- CreateEnum
CREATE TYPE "SchedulePeriodStatus" AS ENUM ('RASCUNHO', 'PUBLICADA');

-- CreateEnum
CREATE TYPE "ShiftSwapRequestStatus" AS ENUM ('SOLICITADA', 'ACEITA_DESTINATARIO', 'RECUSADA_DESTINATARIO', 'APROVADA_GERENTE', 'REPROVADA_GERENTE', 'CANCELADA');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dayOffEntryId" TEXT,
ADD COLUMN     "schedulePeriodId" TEXT,
ADD COLUMN     "shiftSwapRequestId" TEXT;

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "motivo" TEXT,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'PLANEJADO',
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayOffType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "kind" "DayOffTypeKind" NOT NULL DEFAULT 'FOLGA',
    "cor" TEXT NOT NULL DEFAULT '#2952E3',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayOffType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreClosedWeekday" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreClosedWeekday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectorCoverageConfig" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "quantidadeMinima" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectorCoverageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulePeriod" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "mesReferencia" TIMESTAMP(3) NOT NULL,
    "status" "SchedulePeriodStatus" NOT NULL DEFAULT 'RASCUNHO',
    "publicadoPorId" TEXT,
    "publicadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayOffEntry" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "schedulePeriodId" TEXT NOT NULL,
    "dayOffTypeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT,
    "autorizadoPorId" TEXT,
    "autorizadoEm" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayOffEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftSwapRequest" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "solicitanteEntryId" TEXT NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "destinatarioEntryId" TEXT NOT NULL,
    "status" "ShiftSwapRequestStatus" NOT NULL DEFAULT 'SOLICITADA',
    "motivo" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "motivoRecusa" TEXT,
    "aprovadorId" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "motivoReprovacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftSwapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleChangeLog" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dayOffEntryId" TEXT,
    "acao" TEXT NOT NULL,
    "tipoAnteriorNome" TEXT,
    "dataAnterior" TIMESTAMP(3),
    "tipoNovoNome" TEXT,
    "dataNova" TIMESTAMP(3),
    "motivo" TEXT,
    "alteradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Absence_employeeId_idx" ON "Absence"("employeeId");

-- CreateIndex
CREATE INDEX "Absence_empresaId_dataInicio_idx" ON "Absence"("empresaId", "dataInicio");

-- CreateIndex
CREATE UNIQUE INDEX "DayOffType_key_key" ON "DayOffType"("key");

-- CreateIndex
CREATE INDEX "StoreClosedWeekday_empresaId_idx" ON "StoreClosedWeekday"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreClosedWeekday_empresaId_weekday_key" ON "StoreClosedWeekday"("empresaId", "weekday");

-- CreateIndex
CREATE INDEX "SectorCoverageConfig_empresaId_idx" ON "SectorCoverageConfig"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "SectorCoverageConfig_empresaId_setor_key" ON "SectorCoverageConfig"("empresaId", "setor");

-- CreateIndex
CREATE INDEX "SchedulePeriod_empresaId_idx" ON "SchedulePeriod"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulePeriod_empresaId_mesReferencia_key" ON "SchedulePeriod"("empresaId", "mesReferencia");

-- CreateIndex
CREATE INDEX "DayOffEntry_empresaId_date_idx" ON "DayOffEntry"("empresaId", "date");

-- CreateIndex
CREATE INDEX "DayOffEntry_schedulePeriodId_idx" ON "DayOffEntry"("schedulePeriodId");

-- CreateIndex
CREATE INDEX "DayOffEntry_dayOffTypeId_idx" ON "DayOffEntry"("dayOffTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "DayOffEntry_employeeId_date_key" ON "DayOffEntry"("employeeId", "date");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_empresaId_status_idx" ON "ShiftSwapRequest"("empresaId", "status");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_solicitanteId_idx" ON "ShiftSwapRequest"("solicitanteId");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_destinatarioId_idx" ON "ShiftSwapRequest"("destinatarioId");

-- CreateIndex
CREATE INDEX "ScheduleChangeLog_employeeId_idx" ON "ScheduleChangeLog"("employeeId");

-- CreateIndex
CREATE INDEX "ScheduleChangeLog_empresaId_createdAt_idx" ON "ScheduleChangeLog"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleChangeLog_dayOffEntryId_idx" ON "ScheduleChangeLog"("dayOffEntryId");

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreClosedWeekday" ADD CONSTRAINT "StoreClosedWeekday_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectorCoverageConfig" ADD CONSTRAINT "SectorCoverageConfig_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePeriod" ADD CONSTRAINT "SchedulePeriod_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePeriod" ADD CONSTRAINT "SchedulePeriod_publicadoPorId_fkey" FOREIGN KEY ("publicadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOffEntry" ADD CONSTRAINT "DayOffEntry_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOffEntry" ADD CONSTRAINT "DayOffEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOffEntry" ADD CONSTRAINT "DayOffEntry_schedulePeriodId_fkey" FOREIGN KEY ("schedulePeriodId") REFERENCES "SchedulePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOffEntry" ADD CONSTRAINT "DayOffEntry_dayOffTypeId_fkey" FOREIGN KEY ("dayOffTypeId") REFERENCES "DayOffType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOffEntry" ADD CONSTRAINT "DayOffEntry_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOffEntry" ADD CONSTRAINT "DayOffEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_solicitanteEntryId_fkey" FOREIGN KEY ("solicitanteEntryId") REFERENCES "DayOffEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_destinatarioEntryId_fkey" FOREIGN KEY ("destinatarioEntryId") REFERENCES "DayOffEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_aprovadorId_fkey" FOREIGN KEY ("aprovadorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeLog" ADD CONSTRAINT "ScheduleChangeLog_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeLog" ADD CONSTRAINT "ScheduleChangeLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeLog" ADD CONSTRAINT "ScheduleChangeLog_dayOffEntryId_fkey" FOREIGN KEY ("dayOffEntryId") REFERENCES "DayOffEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeLog" ADD CONSTRAINT "ScheduleChangeLog_alteradoPorId_fkey" FOREIGN KEY ("alteradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_schedulePeriodId_fkey" FOREIGN KEY ("schedulePeriodId") REFERENCES "SchedulePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_dayOffEntryId_fkey" FOREIGN KEY ("dayOffEntryId") REFERENCES "DayOffEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_shiftSwapRequestId_fkey" FOREIGN KEY ("shiftSwapRequestId") REFERENCES "ShiftSwapRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
