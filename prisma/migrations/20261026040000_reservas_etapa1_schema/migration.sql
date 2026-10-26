-- Reservas — Etapa 1 (estrutura administrativa, worktree "reservas-etapa1"): schema puro, sem
-- menu/permissão ainda (ver migration seguinte,
-- 20261026041000_reservas_etapa1_menu_permissao, para o INSERT de dados no menu lateral e nos
-- perfis de permissão — igual ao padrão já usado em
-- prisma/migrations/20261021184823_central_bugs_melhorias +
-- 20261023190000_administrativo_bugs_melhorias_menu +
-- 20261023194500_administrativo_bugs_melhorias_restringe_nao_admin).
--
-- `ReservationSettings` (1:1 com Empresa, cada loja Nord pode ter horário diferente) +
-- `ReservationWeekdayHours` (1 linha por dia da semana, 0=Domingo...6=Sábado, mesma convenção de
-- `ProductionWeekdayWeight.weekday`/`WEEKDAY_LABEL` em src/lib/producao.ts) + `ReservationBlockedDate`
-- (bloqueios excepcionais de data, ex. feriados). Mesas/Ambientes/Reserva/Fila de Espera ficam para
-- as próximas etapas — fora do escopo desta migration.
--
-- Gerado com `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma
-- --script` contra um banco descartável já no estado "170 migrations aplicadas" (sem alteração
-- manual depois) — ver relatório da tarefa para o passo a passo da validação ao vivo.
-- CreateTable
CREATE TABLE "ReservationSettings" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationWeekdayHours" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "openTime" TEXT NOT NULL DEFAULT '18:00',
    "closeTime" TEXT NOT NULL DEFAULT '23:00',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationWeekdayHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationBlockedDate" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationBlockedDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReservationSettings_empresaId_key" ON "ReservationSettings"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationWeekdayHours_settingsId_dayOfWeek_key" ON "ReservationWeekdayHours"("settingsId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationBlockedDate_empresaId_date_key" ON "ReservationBlockedDate"("empresaId", "date");

-- AddForeignKey
ALTER TABLE "ReservationSettings" ADD CONSTRAINT "ReservationSettings_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationWeekdayHours" ADD CONSTRAINT "ReservationWeekdayHours_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "ReservationSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationBlockedDate" ADD CONSTRAINT "ReservationBlockedDate_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationBlockedDate" ADD CONSTRAINT "ReservationBlockedDate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
