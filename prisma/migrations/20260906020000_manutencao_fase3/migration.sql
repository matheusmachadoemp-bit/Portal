-- CreateEnum
CREATE TYPE "ManutencaoPreventivaOcorrenciaStatus" AS ENUM ('PROGRAMADA', 'EM_EXECUCAO', 'CONCLUIDA', 'REAGENDADA', 'CANCELADA');

-- AlterEnum
ALTER TYPE "ManutencaoFrequencia" ADD VALUE 'PERSONALIZADA';

-- CreateTable
CREATE TABLE "ManutencaoPreventiva" (
    "id" TEXT NOT NULL,
    "equipamentoId" TEXT NOT NULL,
    "tipoServico" TEXT NOT NULL,
    "descricao" TEXT,
    "frequencia" "ManutencaoFrequencia" NOT NULL DEFAULT 'MENSAL',
    "intervaloDiasCustom" INTEGER,
    "horario" TEXT,
    "responsavelId" TEXT,
    "prestadorId" TEXT,
    "custoPrevisto" DOUBLE PRECISION,
    "checklist" TEXT,
    "necessidadeParada" BOOLEAN NOT NULL DEFAULT false,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutencaoPreventiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManutencaoPreventivaOcorrencia" (
    "id" TEXT NOT NULL,
    "preventivaId" TEXT NOT NULL,
    "dataProgramada" TIMESTAMP(3) NOT NULL,
    "status" "ManutencaoPreventivaOcorrenciaStatus" NOT NULL DEFAULT 'PROGRAMADA',
    "registroId" TEXT,
    "motivoReagendamento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutencaoPreventivaOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManutencaoPreventiva_equipamentoId_idx" ON "ManutencaoPreventiva"("equipamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "ManutencaoPreventivaOcorrencia_registroId_key" ON "ManutencaoPreventivaOcorrencia"("registroId");

-- CreateIndex
CREATE INDEX "ManutencaoPreventivaOcorrencia_dataProgramada_idx" ON "ManutencaoPreventivaOcorrencia"("dataProgramada");

-- CreateIndex
CREATE UNIQUE INDEX "ManutencaoPreventivaOcorrencia_preventivaId_dataProgramada_key" ON "ManutencaoPreventivaOcorrencia"("preventivaId", "dataProgramada");

-- AddForeignKey
ALTER TABLE "ManutencaoPreventiva" ADD CONSTRAINT "ManutencaoPreventiva_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoPreventiva" ADD CONSTRAINT "ManutencaoPreventiva_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoPreventiva" ADD CONSTRAINT "ManutencaoPreventiva_prestadorId_fkey" FOREIGN KEY ("prestadorId") REFERENCES "Prestador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoPreventiva" ADD CONSTRAINT "ManutencaoPreventiva_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoPreventivaOcorrencia" ADD CONSTRAINT "ManutencaoPreventivaOcorrencia_preventivaId_fkey" FOREIGN KEY ("preventivaId") REFERENCES "ManutencaoPreventiva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoPreventivaOcorrencia" ADD CONSTRAINT "ManutencaoPreventivaOcorrencia_registroId_fkey" FOREIGN KEY ("registroId") REFERENCES "ManutencaoRegistro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

