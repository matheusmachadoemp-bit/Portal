-- CreateEnum
CREATE TYPE "FechamentoOcorrenciaStatus" AS ENUM ('ABERTA', 'TRANSFORMADA', 'RESOLVIDA', 'DESCARTADA');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "fechamentoOcorrenciaId" TEXT;

-- CreateTable
CREATE TABLE "FechamentoOcorrencia" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "submissaoId" TEXT NOT NULL,
    "perguntaId" TEXT NOT NULL,
    "respostaId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "gravidade" "FechamentoGravidade" NOT NULL DEFAULT 'ATENCAO',
    "descricao" TEXT NOT NULL,
    "comoFoiResolvido" TEXT,
    "pendencia" TEXT,
    "status" "FechamentoOcorrenciaStatus" NOT NULL DEFAULT 'ABERTA',
    "transformadoEmTaskId" TEXT,
    "transformadoEmChamadoId" TEXT,
    "transformadoPorId" TEXT,
    "transformadoEm" TIMESTAMP(3),
    "resolvidoPorId" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FechamentoOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FechamentoOcorrencia_respostaId_key" ON "FechamentoOcorrencia"("respostaId");

-- CreateIndex
CREATE INDEX "FechamentoOcorrencia_empresaId_data_idx" ON "FechamentoOcorrencia"("empresaId", "data");

-- CreateIndex
CREATE INDEX "FechamentoOcorrencia_empresaId_status_idx" ON "FechamentoOcorrencia"("empresaId", "status");

-- CreateIndex
CREATE INDEX "FechamentoOcorrencia_categoriaId_idx" ON "FechamentoOcorrencia"("categoriaId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_fechamentoOcorrenciaId_fkey" FOREIGN KEY ("fechamentoOcorrenciaId") REFERENCES "FechamentoOcorrencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoOcorrencia" ADD CONSTRAINT "FechamentoOcorrencia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoOcorrencia" ADD CONSTRAINT "FechamentoOcorrencia_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "FechamentoCargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoOcorrencia" ADD CONSTRAINT "FechamentoOcorrencia_submissaoId_fkey" FOREIGN KEY ("submissaoId") REFERENCES "FechamentoSubmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoOcorrencia" ADD CONSTRAINT "FechamentoOcorrencia_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "FechamentoPergunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoOcorrencia" ADD CONSTRAINT "FechamentoOcorrencia_respostaId_fkey" FOREIGN KEY ("respostaId") REFERENCES "FechamentoResposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoOcorrencia" ADD CONSTRAINT "FechamentoOcorrencia_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "FechamentoCategoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoOcorrencia" ADD CONSTRAINT "FechamentoOcorrencia_transformadoEmTaskId_fkey" FOREIGN KEY ("transformadoEmTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoOcorrencia" ADD CONSTRAINT "FechamentoOcorrencia_transformadoEmChamadoId_fkey" FOREIGN KEY ("transformadoEmChamadoId") REFERENCES "Chamado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoOcorrencia" ADD CONSTRAINT "FechamentoOcorrencia_transformadoPorId_fkey" FOREIGN KEY ("transformadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoOcorrencia" ADD CONSTRAINT "FechamentoOcorrencia_resolvidoPorId_fkey" FOREIGN KEY ("resolvidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
