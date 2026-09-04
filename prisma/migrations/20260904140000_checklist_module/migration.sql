
-- CreateEnum
CREATE TYPE "ChecklistRecurrence" AS ENUM ('UNICA', 'DIARIA', 'SEMANAL', 'MENSAL', 'PERSONALIZADA');

-- CreateEnum
CREATE TYPE "ChecklistItemType" AS ENUM ('CONCLUIDO', 'TEXTO_CURTO', 'TEXTO_LONGO', 'NUMERO', 'TEMPERATURA', 'QUANTIDADE', 'SIM_NAO', 'FOTO');

-- CreateEnum
CREATE TYPE "ChecklistPhotoRequirement" AS ENUM ('SEM_FOTO', 'OPCIONAL', 'OBRIGATORIA');

-- CreateEnum
CREATE TYPE "ChecklistOccurrenceStatus" AS ENUM ('AGENDADO', 'DISPONIVEL', 'EM_ANDAMENTO', 'CONCLUIDO_NO_PRAZO', 'CONCLUIDO_COM_ATRASO', 'ATRASADO', 'NAO_REALIZADO', 'JUSTIFICADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ChecklistItemResponseStatus" AS ENUM ('PENDENTE', 'CONCLUIDO', 'PROBLEMA');

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "setor" "GoalCategory" NOT NULL,
    "categoria" TEXT,
    "turno" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "recurrence" "ChecklistRecurrence" NOT NULL DEFAULT 'DIARIA',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "releaseTime" TEXT NOT NULL,
    "dueTime" TEXT NOT NULL,
    "segunda" BOOLEAN NOT NULL DEFAULT true,
    "terca" BOOLEAN NOT NULL DEFAULT false,
    "quarta" BOOLEAN NOT NULL DEFAULT true,
    "quinta" BOOLEAN NOT NULL DEFAULT true,
    "sexta" BOOLEAN NOT NULL DEFAULT true,
    "sabado" BOOLEAN NOT NULL DEFAULT true,
    "domingo" BOOLEAN NOT NULL DEFAULT true,
    "responsavelId" TEXT,
    "substitutoId" TEXT,
    "substituirAutomaticamente" BOOLEAN NOT NULL DEFAULT false,
    "fotoChecklist" "ChecklistPhotoRequirement" NOT NULL DEFAULT 'SEM_FOTO',
    "exigirObservacaoProblema" BOOLEAN NOT NULL DEFAULT false,
    "cobrancaAtiva" BOOLEAN NOT NULL DEFAULT true,
    "avisoAntesMinutos" INTEGER NOT NULL DEFAULT 30,
    "avisoAtrasoResponsavelMinutos" INTEGER NOT NULL DEFAULT 10,
    "alertaCriticoMinutos" INTEGER NOT NULL DEFAULT 30,
    "naoRealizadoMinutos" INTEGER NOT NULL DEFAULT 60,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItemTemplate" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "orientacao" TEXT,
    "tipo" "ChecklistItemType" NOT NULL DEFAULT 'CONCLUIDO',
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "fotoObrigatoria" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItemTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistOccurrence" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "releaseAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "ChecklistOccurrenceStatus" NOT NULL DEFAULT 'AGENDADO',
    "responsavelId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "justificativa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItemResponse" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "itemTemplateId" TEXT NOT NULL,
    "status" "ChecklistItemResponseStatus" NOT NULL DEFAULT 'PENDENTE',
    "valorTexto" TEXT,
    "valorNumero" DOUBLE PRECISION,
    "valorBooleano" BOOLEAN,
    "observacao" TEXT,
    "respondidoPorId" TEXT,
    "respondidoEm" TIMESTAMP(3),

    CONSTRAINT "ChecklistItemResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistPhoto" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "itemResponseId" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "observacao" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistTemplate_empresaId_setor_idx" ON "ChecklistTemplate"("empresaId", "setor");

-- CreateIndex
CREATE INDEX "ChecklistOccurrence_empresaId_date_idx" ON "ChecklistOccurrence"("empresaId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistOccurrence_templateId_date_key" ON "ChecklistOccurrence"("templateId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItemResponse_occurrenceId_itemTemplateId_key" ON "ChecklistItemResponse"("occurrenceId", "itemTemplateId");

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_substitutoId_fkey" FOREIGN KEY ("substitutoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItemTemplate" ADD CONSTRAINT "ChecklistItemTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistOccurrence" ADD CONSTRAINT "ChecklistOccurrence_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistOccurrence" ADD CONSTRAINT "ChecklistOccurrence_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistOccurrence" ADD CONSTRAINT "ChecklistOccurrence_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItemResponse" ADD CONSTRAINT "ChecklistItemResponse_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ChecklistOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItemResponse" ADD CONSTRAINT "ChecklistItemResponse_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ChecklistItemTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItemResponse" ADD CONSTRAINT "ChecklistItemResponse_respondidoPorId_fkey" FOREIGN KEY ("respondidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistPhoto" ADD CONSTRAINT "ChecklistPhoto_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ChecklistOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistPhoto" ADD CONSTRAINT "ChecklistPhoto_itemResponseId_fkey" FOREIGN KEY ("itemResponseId") REFERENCES "ChecklistItemResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistPhoto" ADD CONSTRAINT "ChecklistPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Categoria "Tarefas" e subcategoria "Checklist" no menu lateral
INSERT INTO "Category" ("id", "key", "name", "icon", "color", "order", "active", "isSystem", "contentType", "createdAt", "updatedAt")
VALUES ('cat-tarefas', 'tarefas', 'Tarefas', 'ListChecks', '#2952E3', 15, true, true, 'tarefas', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT 'sub-tarefas-checklist', "id", 'checklist', 'Checklist', 'ClipboardCheck', '#2952E3', 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" WHERE "key" = 'tarefas'
ON CONFLICT ("categoryId", "key") DO NOTHING;
