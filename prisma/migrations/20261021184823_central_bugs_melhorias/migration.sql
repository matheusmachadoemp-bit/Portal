-- CreateEnum
CREATE TYPE "FeedbackTipo" AS ENUM ('BUG', 'SUGESTAO');

-- CreateEnum
CREATE TYPE "FeedbackCategoriaProblema" AS ENUM ('FUNCIONALIDADE_NAO_FUNCIONA', 'INFORMACOES_INCORRETAS', 'ERRO_VISUAL', 'LENTIDAO', 'TRAVAMENTO', 'PROBLEMA_ACESSO', 'ERRO_AO_SALVAR', 'OUTRO');

-- CreateEnum
CREATE TYPE "FeedbackImpacto" AS ENUM ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO');

-- CreateEnum
CREATE TYPE "FeedbackPrioridade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('RECEBIDO', 'EM_ANALISE', 'EM_CORRECAO', 'AGUARDANDO_VALIDACAO', 'CORRIGIDO', 'REABERTO', 'NAO_REPRODUZIDO', 'RECEBIDA', 'EM_AVALIACAO', 'APROVADA', 'EM_DESENVOLVIMENTO', 'IMPLEMENTADA', 'RECUSADA');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "feedbackReportId" TEXT;

-- CreateTable
CREATE TABLE "FeedbackProtocolCounter" (
    "tipo" "FeedbackTipo" NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FeedbackProtocolCounter_pkey" PRIMARY KEY ("tipo")
);

-- CreateTable
CREATE TABLE "FeedbackReport" (
    "id" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "tipo" "FeedbackTipo" NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoriaId" TEXT,
    "subcategoriaId" TEXT,
    "moduloAfetadoTexto" TEXT,
    "categoriaProblema" "FeedbackCategoriaProblema",
    "impacto" "FeedbackImpacto",
    "beneficioEsperado" TEXT,
    "prioridade" "FeedbackPrioridade" NOT NULL DEFAULT 'MEDIA',
    "status" "FeedbackStatus" NOT NULL DEFAULT 'RECEBIDO',
    "usuarioCriadorId" TEXT NOT NULL,
    "empresaId" TEXT,
    "responsavelId" TEXT,
    "metadados" JSONB,
    "possivelDuplicataDeId" TEXT,
    "versaoCorrigidaEm" TEXT,
    "descricaoSolucao" TEXT,
    "dataConclusao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackAttachment" (
    "id" TEXT NOT NULL,
    "feedbackReportId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackHistory" (
    "id" TEXT NOT NULL,
    "feedbackReportId" TEXT NOT NULL,
    "tipoAlteracao" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorNovo" TEXT,
    "usuarioResponsavelId" TEXT NOT NULL,
    "comentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackComment" (
    "id" TEXT NOT NULL,
    "feedbackReportId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackReport_protocolo_key" ON "FeedbackReport"("protocolo");

-- CreateIndex
CREATE INDEX "FeedbackReport_tipo_status_idx" ON "FeedbackReport"("tipo", "status");

-- CreateIndex
CREATE INDEX "FeedbackReport_empresaId_idx" ON "FeedbackReport"("empresaId");

-- CreateIndex
CREATE INDEX "FeedbackReport_usuarioCriadorId_idx" ON "FeedbackReport"("usuarioCriadorId");

-- CreateIndex
CREATE INDEX "FeedbackReport_responsavelId_idx" ON "FeedbackReport"("responsavelId");

-- CreateIndex
CREATE INDEX "FeedbackReport_categoriaId_idx" ON "FeedbackReport"("categoriaId");

-- CreateIndex
CREATE INDEX "FeedbackReport_subcategoriaId_idx" ON "FeedbackReport"("subcategoriaId");

-- CreateIndex
CREATE INDEX "FeedbackReport_createdAt_idx" ON "FeedbackReport"("createdAt");

-- CreateIndex
CREATE INDEX "FeedbackAttachment_feedbackReportId_idx" ON "FeedbackAttachment"("feedbackReportId");

-- CreateIndex
CREATE INDEX "FeedbackHistory_feedbackReportId_idx" ON "FeedbackHistory"("feedbackReportId");

-- CreateIndex
CREATE INDEX "FeedbackComment_feedbackReportId_idx" ON "FeedbackComment"("feedbackReportId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_feedbackReportId_fkey" FOREIGN KEY ("feedbackReportId") REFERENCES "FeedbackReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_subcategoriaId_fkey" FOREIGN KEY ("subcategoriaId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_usuarioCriadorId_fkey" FOREIGN KEY ("usuarioCriadorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_possivelDuplicataDeId_fkey" FOREIGN KEY ("possivelDuplicataDeId") REFERENCES "FeedbackReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAttachment" ADD CONSTRAINT "FeedbackAttachment_feedbackReportId_fkey" FOREIGN KEY ("feedbackReportId") REFERENCES "FeedbackReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAttachment" ADD CONSTRAINT "FeedbackAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackHistory" ADD CONSTRAINT "FeedbackHistory_feedbackReportId_fkey" FOREIGN KEY ("feedbackReportId") REFERENCES "FeedbackReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackHistory" ADD CONSTRAINT "FeedbackHistory_usuarioResponsavelId_fkey" FOREIGN KEY ("usuarioResponsavelId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_feedbackReportId_fkey" FOREIGN KEY ("feedbackReportId") REFERENCES "FeedbackReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
