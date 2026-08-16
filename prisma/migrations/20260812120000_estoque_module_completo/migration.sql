-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PEDIDO_REALIZADO', 'AGUARDANDO_ENTREGA', 'RECEBIDO_PARCIAL', 'RECEBIDO', 'DIVERGENCIA', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ReceivingStatus" AS ENUM ('APROVADO', 'APROVADO_RESSALVA', 'RECEBIDO_PARCIAL', 'RECUSADO', 'AGUARDANDO_SOLUCAO');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('SOLICITADA', 'SEPARACAO', 'ENVIADA', 'RECEBIDA', 'DIVERGENCIA');

-- CreateEnum
CREATE TYPE "LossReason" AS ENUM ('VENCIMENTO', 'ERRO_PRODUCAO', 'QUEIMA', 'QUEDA', 'CONTAMINACAO', 'ARMAZENAMENTO_INCORRETO', 'PORCIONAMENTO_INCORRETO', 'DEVOLUCAO_CLIENTE', 'SOBRA_PRODUCAO', 'PERDA_LIMPEZA', 'PRODUTO_DANIFICADO', 'FURTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "CountType" AS ENUM ('SEMANAL', 'MENSAL');

-- CreateEnum
CREATE TYPE "CountStatus" AS ENUM ('RASCUNHO', 'EM_ANDAMENTO', 'CONCLUIDA', 'APROVADA', 'REABERTA');

-- CreateEnum
CREATE TYPE "CountItemStatus" AS ENUM ('PENDENTE', 'CONTADO', 'CONFERIDO', 'DIVERGENCIA', 'RECONTAGEM', 'APROVADO');

-- CreateEnum
CREATE TYPE "ActionPlanStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'ATRASADO');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "metaCmvPercent" DOUBLE PRECISION NOT NULL DEFAULT 30,
ADD COLUMN     "metaDivergenciaContagemPercent" DOUBLE PRECISION NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "setor" TEXT,
ADD COLUMN     "codigoInterno" TEXT,
ADD COLUMN     "codigoBarras" TEXT,
ADD COLUMN     "localArmazenamento" TEXT,
ADD COLUMN     "unidadeCompra" TEXT,
ADD COLUMN     "fatorConversao" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "pesoEmbalagem" DOUBLE PRECISION,
ADD COLUMN     "rendimentoAproveitavel" DOUBLE PRECISION,
ADD COLUMN     "estoqueMaximo" DOUBLE PRECISION,
ADD COLUMN     "pontoReposicao" DOUBLE PRECISION,
ADD COLUMN     "fornecedorPrincipalId" TEXT,
ADD COLUMN     "perecivel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fotoUrl" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "origin" TEXT,
ADD COLUMN     "origem" TEXT,
ADD COLUMN     "destino" TEXT,
ADD COLUMN     "documentoUrl" TEXT,
ADD COLUMN     "autorizadoPor" TEXT;

-- CreateTable
CREATE TABLE "StockCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2952E3',
    "icon" TEXT NOT NULL DEFAULT 'Boxes',
    "setor" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "metaPerdaPercent" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "periodicidadeContagem" TEXT NOT NULL DEFAULT 'SEMANAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "endereco" TEXT,
    "prazoPagamentoDias" INTEGER,
    "prazoEntregaDias" INTEGER,
    "pedidoMinimo" DOUBLE PRECISION,
    "avaliacao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "numeroNota" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compradorResponsavel" TEXT,
    "formaPagamento" "PaymentMethod",
    "dataVencimento" TIMESTAMP(3),
    "notaFiscalUrl" TEXT,
    "desconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "frete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PEDIDO_REALIZADO',
    "observacoes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "unidade" TEXT NOT NULL,
    "valorUnitario" DOUBLE PRECISION NOT NULL,
    "valorTotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receiving" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsavel" TEXT,
    "status" "ReceivingStatus" NOT NULL DEFAULT 'AGUARDANDO_SOLUCAO',
    "divergencias" TEXT,
    "detalhes" TEXT,
    "fotoMercadoriaUrl" TEXT,
    "fotoNotaUrl" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receiving_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "origemEmpresaId" TEXT NOT NULL,
    "destinoEmpresaId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'SOLICITADA',
    "responsavelEnvio" TEXT,
    "responsavelRecebimento" TEXT,
    "dataEnvio" TIMESTAMP(3),
    "dataRecebimento" TIMESTAMP(3),
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "quantidadeEnviada" DOUBLE PRECISION NOT NULL,
    "quantidadeRecebida" DOUBLE PRECISION,
    "observacao" TEXT,

    CONSTRAINT "TransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loss" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "setor" TEXT,
    "ingredientId" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "unidade" TEXT NOT NULL,
    "valorEstimado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "motivo" "LossReason" NOT NULL,
    "responsavel" TEXT,
    "aprovador" TEXT,
    "fotoUrl" TEXT,
    "observacao" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Loss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "type" "CountType" NOT NULL,
    "setor" TEXT,
    "semana" INTEGER,
    "mes" INTEGER,
    "ano" INTEGER NOT NULL,
    "dataContagem" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsavel" TEXT,
    "horaInicio" TEXT,
    "horaFim" TEXT,
    "status" "CountStatus" NOT NULL DEFAULT 'RASCUNHO',
    "checklistJson" TEXT,
    "motivoReabertura" TEXT,
    "aprovadoPor" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountItem" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "setor" TEXT,
    "estoqueEsperado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantidadeContada" DOUBLE PRECISION,
    "diferencaQtd" DOUBLE PRECISION,
    "diferencaPercent" DOUBLE PRECISION,
    "diferencaReais" DOUBLE PRECISION,
    "status" "CountItemStatus" NOT NULL DEFAULT 'PENDENTE',
    "observacao" TEXT,
    "fotoUrl" TEXT,
    "justificativa" TEXT,

    CONSTRAINT "StockCountItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionPlan" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "problema" TEXT NOT NULL,
    "causaProvavel" TEXT,
    "acaoCorretiva" TEXT NOT NULL,
    "responsavel" TEXT,
    "prazo" TIMESTAMP(3),
    "status" "ActionPlanStatus" NOT NULL DEFAULT 'PENDENTE',
    "evidenciaUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockCategory_key_key" ON "StockCategory"("key");

-- CreateIndex
CREATE INDEX "Purchase_empresaId_data_idx" ON "Purchase"("empresaId", "data");

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Receiving_purchaseId_key" ON "Receiving"("purchaseId");

-- CreateIndex
CREATE INDEX "Loss_empresaId_data_idx" ON "Loss"("empresaId", "data");

-- CreateIndex
CREATE INDEX "StockCount_empresaId_type_ano_idx" ON "StockCount"("empresaId", "type", "ano");

-- CreateIndex
CREATE INDEX "StockCountItem_countId_idx" ON "StockCountItem"("countId");

-- CreateIndex
CREATE INDEX "StockMovement_empresaId_createdAt_idx" ON "StockMovement"("empresaId", "createdAt");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StockCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_fornecedorPrincipalId_fkey" FOREIGN KEY ("fornecedorPrincipalId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receiving" ADD CONSTRAINT "Receiving_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receiving" ADD CONSTRAINT "Receiving_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_origemEmpresaId_fkey" FOREIGN KEY ("origemEmpresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_destinoEmpresaId_fkey" FOREIGN KEY ("destinoEmpresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferItem" ADD CONSTRAINT "TransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferItem" ADD CONSTRAINT "TransferItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loss" ADD CONSTRAINT "Loss_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loss" ADD CONSTRAINT "Loss_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loss" ADD CONSTRAINT "Loss_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPlan" ADD CONSTRAINT "ActionPlan_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPlan" ADD CONSTRAINT "ActionPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
