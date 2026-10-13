-- Contas a Pagar: "o que foi comprado" (itens da nota/boleto) e preço combinado × cobrado.
--
-- Só tabelas NOVAS e uma coluna nova e opcional em "Payable" (invoiceId): nenhum dado existente muda.
--   * SupplierInvoice: a compra/nota do fornecedor (uma nota paga em várias parcelas conta uma vez só).
--   * SupplierInvoiceItem: os itens (insumo do Estoque, "outro item" com grupo, ou ajuste como frete/desconto),
--     com preço combinado, origem do combinado e preço cobrado.
--   * Payable.invoiceId: liga o boleto à compra (SET NULL se a compra for apagada).
-- Não mexe em estoque nem em saldo: é só o registro de "o que foi comprado e por quanto".

-- CreateEnum
CREATE TYPE "SupplierInvoiceItemKind" AS ENUM ('INSUMO', 'OUTRO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "SupplierInvoicePriceSource" AS ENUM ('PEDIDO_ESTOQUE', 'TABELA_FORNECEDOR', 'ULTIMO_PRECO', 'MANUAL', 'NAO_COMBINADO');

-- CreateEnum
CREATE TYPE "SupplierInvoiceDivergenceStatus" AS ENUM ('SEM_DIVERGENCIA', 'EM_CONTESTACAO', 'ACEITA');

-- AlterTable
ALTER TABLE "Payable" ADD COLUMN     "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "supplierId" TEXT,
    "fornecedorNome" TEXT NOT NULL,
    "fornecedorChave" TEXT NOT NULL,
    "numeroNota" TEXT,
    "dataCompra" TIMESTAMP(3) NOT NULL,
    "totalCobrado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCombinado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalComparado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "divergenciaStatus" "SupplierInvoiceDivergenceStatus" NOT NULL DEFAULT 'SEM_DIVERGENCIA',
    "divergenciaMotivo" TEXT,
    "divergenciaObservacao" TEXT,
    "divergenciaValor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "divergenciaResolvidaEm" TIMESTAMP(3),
    "divergenciaResolvidaPorId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierInvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "kind" "SupplierInvoiceItemKind" NOT NULL,
    "ingredientId" TEXT,
    "nome" TEXT NOT NULL,
    "grupo" TEXT,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "unidade" TEXT NOT NULL,
    "precoCombinado" DOUBLE PRECISION,
    "origemCombinado" "SupplierInvoicePriceSource",
    "precoCobrado" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SupplierInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierInvoice_empresaId_dataCompra_idx" ON "SupplierInvoice"("empresaId", "dataCompra");

-- CreateIndex
CREATE INDEX "SupplierInvoice_empresaId_supplierId_dataCompra_idx" ON "SupplierInvoice"("empresaId", "supplierId", "dataCompra");

-- CreateIndex
CREATE INDEX "SupplierInvoice_empresaId_fornecedorChave_dataCompra_idx" ON "SupplierInvoice"("empresaId", "fornecedorChave", "dataCompra");

-- CreateIndex
CREATE INDEX "SupplierInvoiceItem_invoiceId_idx" ON "SupplierInvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "SupplierInvoiceItem_ingredientId_idx" ON "SupplierInvoiceItem"("ingredientId");

-- CreateIndex
CREATE INDEX "Payable_invoiceId_idx" ON "Payable"("invoiceId");

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoiceItem" ADD CONSTRAINT "SupplierInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoiceItem" ADD CONSTRAINT "SupplierInvoiceItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

