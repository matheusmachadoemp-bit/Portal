-- Expansão "Escala de Folgas e Eventos" (ver comentário "Escala de Folgas E EVENTOS (expansão)"
-- no bloco "RH — ESCALA DE FOLGAS" em prisma/schema.prisma): catálogo global de tipos de evento
-- (EventType) e a ocorrência em si por loja+dia, sem nenhum colaborador vinculado (CalendarEvent).

-- CreateTable
CREATE TABLE "EventType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#2952E3',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "eventTypeId" TEXT,
    "titulo" TEXT NOT NULL,
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventType_key_key" ON "EventType"("key");

-- CreateIndex
CREATE INDEX "CalendarEvent_empresaId_date_idx" ON "CalendarEvent"("empresaId", "date");

-- CreateIndex
CREATE INDEX "CalendarEvent_eventTypeId_idx" ON "CalendarEvent"("eventTypeId");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migração de dado: os 2 `DayOffType` workaround ("aniversario-coletivo"/"dia-da-massagem", criados
-- na migration 20261031010000_escala_folgas_tipos_aniversario_massagem) nunca deveriam ter exigido
-- marcar um colaborador por vez pra um evento da loja inteira. Desativados aqui (não excluídos: ver
-- comentário em schema.prisma pro porquê de manter em vez de apagar) pra não aparecerem mais como
-- opção no modal "Adicionar folga" (`validateDayOffType` em `/api/rh/escala-folgas/entries` já
-- rejeita `ativo: false`); qualquer `DayOffEntry` já cadastrada com um deles continua intacta e
-- visível no calendário (nada aqui toca DayOffEntry). O caminho certo pra estes 2 casos de uso
-- passa a ser `CalendarEvent` com `EventType` (seed cria os 2 tipos equivalentes em EventType).
UPDATE "DayOffType" SET "ativo" = false WHERE "key" IN ('aniversario-coletivo', 'dia-da-massagem');
