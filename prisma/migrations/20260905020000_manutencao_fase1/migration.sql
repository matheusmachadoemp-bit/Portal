-- CreateEnum
CREATE TYPE "EquipamentoStatus" AS ENUM ('FUNCIONANDO', 'ATENCAO', 'EM_MANUTENCAO', 'PARADO', 'DESATIVADO', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "ManutencaoFrequencia" AS ENUM ('NENHUMA', 'SEMANAL', 'QUINZENAL', 'MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "ChamadoCategoria" AS ENUM ('EQUIPAMENTO', 'ELETRICA', 'HIDRAULICA', 'ESTRUTURA', 'MOBILIARIO', 'REFRIGERACAO', 'INFORMATICA', 'SEGURANCA', 'OUTRO');

-- CreateEnum
CREATE TYPE "ChamadoPrioridade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "ChamadoStatus" AS ENUM ('RASCUNHO', 'ABERTO', 'AGUARDANDO_AVALIACAO', 'AGUARDANDO_ORCAMENTO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'EM_MANUTENCAO', 'AGUARDANDO_PECA', 'RESOLVIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ManutencaoTipo" AS ENUM ('PREVENTIVA', 'CORRETIVA', 'EMERGENCIAL', 'INSPECAO', 'INSTALACAO', 'LIMPEZA_TECNICA');

-- CreateEnum
CREATE TYPE "ManutencaoAnexoTipo" AS ENUM ('FOTO', 'VIDEO', 'DOCUMENTO');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "chamadoId" TEXT;

-- CreateTable
CREATE TABLE "Equipamento" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fotoUrl" TEXT,
    "setor" TEXT NOT NULL,
    "localizacao" TEXT,
    "categoria" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "numeroSerie" TEXT,
    "dataCompra" TIMESTAMP(3),
    "valorCompra" DOUBLE PRECISION,
    "fornecedor" TEXT,
    "numeroNotaFiscal" TEXT,
    "garantiaAte" TIMESTAMP(3),
    "vidaUtilEstimadaMeses" INTEGER,
    "frequenciaManutencao" "ManutencaoFrequencia" NOT NULL DEFAULT 'NENHUMA',
    "ultimaManutencaoEm" TIMESTAMP(3),
    "proximaManutencaoEm" TIMESTAMP(3),
    "prestadorRecomendado" TEXT,
    "observacoes" TEXT,
    "status" "EquipamentoStatus" NOT NULL DEFAULT 'FUNCIONANDO',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chamado" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "protocolo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "localEspecifico" TEXT,
    "categoria" "ChamadoCategoria" NOT NULL DEFAULT 'OUTRO',
    "equipamentoId" TEXT,
    "prioridade" "ChamadoPrioridade" NOT NULL DEFAULT 'MEDIA',
    "status" "ChamadoStatus" NOT NULL DEFAULT 'ABERTO',
    "solicitanteId" TEXT NOT NULL,
    "responsavelId" TEXT,
    "prazo" TIMESTAMP(3),
    "descricaoSolucao" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChamadoComentario" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChamadoComentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChamadoHistorico" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChamadoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManutencaoAnexo" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT,
    "equipamentoId" TEXT,
    "registroId" TEXT,
    "tipo" "ManutencaoAnexoTipo" NOT NULL DEFAULT 'DOCUMENTO',
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManutencaoAnexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManutencaoRegistro" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "equipamentoId" TEXT NOT NULL,
    "chamadoId" TEXT,
    "tipo" "ManutencaoTipo" NOT NULL DEFAULT 'CORRETIVA',
    "data" TIMESTAMP(3) NOT NULL,
    "horaInicio" TEXT,
    "horaFim" TEXT,
    "servicoExecutado" TEXT NOT NULL,
    "problemaEncontrado" TEXT,
    "solucaoAplicada" TEXT,
    "pecasTrocadas" TEXT,
    "prestador" TEXT,
    "responsavelId" TEXT NOT NULL,
    "valorMaoDeObra" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorPecas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorOutros" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "garantiaServico" TEXT,
    "proximaManutencaoEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManutencaoRegistro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Equipamento_codigo_key" ON "Equipamento"("codigo");

-- CreateIndex
CREATE INDEX "Equipamento_empresaId_status_idx" ON "Equipamento"("empresaId", "status");

-- CreateIndex
CREATE INDEX "Equipamento_empresaId_setor_idx" ON "Equipamento"("empresaId", "setor");

-- CreateIndex
CREATE UNIQUE INDEX "Chamado_protocolo_key" ON "Chamado"("protocolo");

-- CreateIndex
CREATE INDEX "Chamado_empresaId_status_idx" ON "Chamado"("empresaId", "status");

-- CreateIndex
CREATE INDEX "Chamado_empresaId_prioridade_idx" ON "Chamado"("empresaId", "prioridade");

-- CreateIndex
CREATE INDEX "Chamado_equipamentoId_idx" ON "Chamado"("equipamentoId");

-- CreateIndex
CREATE INDEX "ManutencaoAnexo_chamadoId_idx" ON "ManutencaoAnexo"("chamadoId");

-- CreateIndex
CREATE INDEX "ManutencaoAnexo_equipamentoId_idx" ON "ManutencaoAnexo"("equipamentoId");

-- CreateIndex
CREATE INDEX "ManutencaoAnexo_registroId_idx" ON "ManutencaoAnexo"("registroId");

-- CreateIndex
CREATE INDEX "ManutencaoRegistro_empresaId_data_idx" ON "ManutencaoRegistro"("empresaId", "data");

-- CreateIndex
CREATE INDEX "ManutencaoRegistro_equipamentoId_idx" ON "ManutencaoRegistro"("equipamentoId");

-- CreateIndex
CREATE INDEX "ManutencaoRegistro_chamadoId_idx" ON "ManutencaoRegistro"("chamadoId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadoComentario" ADD CONSTRAINT "ChamadoComentario_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadoComentario" ADD CONSTRAINT "ChamadoComentario_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadoHistorico" ADD CONSTRAINT "ChamadoHistorico_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadoHistorico" ADD CONSTRAINT "ChamadoHistorico_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoAnexo" ADD CONSTRAINT "ManutencaoAnexo_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoAnexo" ADD CONSTRAINT "ManutencaoAnexo_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoAnexo" ADD CONSTRAINT "ManutencaoAnexo_registroId_fkey" FOREIGN KEY ("registroId") REFERENCES "ManutencaoRegistro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoAnexo" ADD CONSTRAINT "ManutencaoAnexo_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoRegistro" ADD CONSTRAINT "ManutencaoRegistro_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoRegistro" ADD CONSTRAINT "ManutencaoRegistro_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoRegistro" ADD CONSTRAINT "ManutencaoRegistro_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoRegistro" ADD CONSTRAINT "ManutencaoRegistro_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoRegistro" ADD CONSTRAINT "ManutencaoRegistro_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

