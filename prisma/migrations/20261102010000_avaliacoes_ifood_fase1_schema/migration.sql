-- Avaliações — Fase 1 (só iFood; ver prompt da tarefa "avaliacoes-ifood-fase1" e o bloco de
-- comentário "AVALIAÇÕES" em prisma/schema.prisma para o racional completo): resposta
-- automática às avaliações do iFood, gerada por IA e publicada SOZINHA (sem aprovação humana
-- por avaliação individual — decisão explícita do Matheus), atrás de duas redes de segurança:
--   1. "Empresa"."avaliacoesAutoReplyEnabled" (default FALSE) — toggle geral por loja.
--   2. Palavra-chave de risco (src/lib/review-risk.ts), aplicada em código — não há nada a
--      migrar aqui para essa 2ª rede de segurança, ela só decide o `status` gravado no Review.
--
-- "ReviewPlatform" já prevê o valor GOOGLE para uma Fase 2 futura (Google Business Profile),
-- mas nenhum código desta fase cria/lê um Review com platform = GOOGLE — ver comentário
-- completo no schema.prisma.
--
-- Validado do zero contra um Postgres descartável local (todo o histórico de migrations em
-- produção + esta, aplicando sem erro — ver relatório da tarefa).

-- CreateEnum
CREATE TYPE "ReviewPlatform" AS ENUM ('IFOOD', 'GOOGLE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDENTE', 'RESPONDIDA', 'PRECISA_REVISAO_MANUAL', 'AUTO_PUBLICADA_SEM_RESPOSTA', 'EXPIRADA', 'ERRO');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "avaliacoesAutoReplyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "platform" "ReviewPlatform" NOT NULL,
    "externalReviewId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "customerName" TEXT,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDENTE',
    "generatedReply" TEXT,
    "postedReply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_empresaId_status_idx" ON "Review"("empresaId", "status");

-- CreateIndex
CREATE INDEX "Review_empresaId_reviewDate_idx" ON "Review"("empresaId", "reviewDate");

-- CreateIndex
CREATE UNIQUE INDEX "Review_empresaId_platform_externalReviewId_key" ON "Review"("empresaId", "platform", "externalReviewId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
