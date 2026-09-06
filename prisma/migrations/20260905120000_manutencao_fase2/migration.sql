-- CreateEnum
CREATE TYPE "OrcamentoStatus" AS ENUM ('RECEBIDO', 'EM_ANALISE', 'APROVADO', 'RECUSADO', 'EXPIRADO');

-- AlterTable
ALTER TABLE "ManutencaoAnexo" ADD COLUMN     "orcamentoId" TEXT,
ADD COLUMN     "prestadorId" TEXT;

-- AlterTable
ALTER TABLE "ManutencaoRegistro" ADD COLUMN     "prestadorId" TEXT;

-- CreateTable
CREATE TABLE "Prestador" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeContato" TEXT,
    "especialidade" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "documento" TEXT,
    "endereco" TEXT,
    "empresaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avaliacao" INTEGER,
    "observacoes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prestador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orcamento" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "prestadorId" TEXT NOT NULL,
    "descricao" TEXT,
    "valorMaoDeObra" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorPecas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prazo" TEXT,
    "garantia" TEXT,
    "status" "OrcamentoStatus" NOT NULL DEFAULT 'RECEBIDO',
    "motivoRecusa" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Orcamento_chamadoId_idx" ON "Orcamento"("chamadoId");

-- CreateIndex
CREATE INDEX "Orcamento_prestadorId_idx" ON "Orcamento"("prestadorId");

-- CreateIndex
CREATE INDEX "ManutencaoAnexo_orcamentoId_idx" ON "ManutencaoAnexo"("orcamentoId");

-- AddForeignKey
ALTER TABLE "ManutencaoAnexo" ADD CONSTRAINT "ManutencaoAnexo_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoAnexo" ADD CONSTRAINT "ManutencaoAnexo_prestadorId_fkey" FOREIGN KEY ("prestadorId") REFERENCES "Prestador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prestador" ADD CONSTRAINT "Prestador_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_prestadorId_fkey" FOREIGN KEY ("prestadorId") REFERENCES "Prestador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoRegistro" ADD CONSTRAINT "ManutencaoRegistro_prestadorId_fkey" FOREIGN KEY ("prestadorId") REFERENCES "Prestador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

