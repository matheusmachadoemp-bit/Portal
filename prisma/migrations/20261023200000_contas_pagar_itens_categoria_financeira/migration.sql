-- Contas a Pagar multicategoria: categoria financeira (DRE) opcional por item de "O que foi
-- comprado" (SupplierInvoiceItem), para um boleto que mistura produtos de categorias diferentes
-- (ex. descartáveis + material de limpeza) poder ser dividido na DRE por item em vez de cair
-- inteiro na categoria única do boleto (Payable.categoriaId). Coluna opcional, sem backfill: todo o
-- histórico existente fica com categoriaId = NULL e continua caindo 100% na categoria do boleto —
-- ver `splitPayableByCategory` em `src/lib/compra-itens.ts` (usado por DRE, Fluxo de Caixa e
-- Dashboard Financeiro, pra nenhum dos três contar uma história diferente do mesmo boleto).

-- AlterTable
ALTER TABLE "SupplierInvoiceItem" ADD COLUMN     "categoriaId" TEXT;

-- CreateIndex
CREATE INDEX "SupplierInvoiceItem_categoriaId_idx" ON "SupplierInvoiceItem"("categoriaId");

-- AddForeignKey
ALTER TABLE "SupplierInvoiceItem" ADD CONSTRAINT "SupplierInvoiceItem_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "FinancialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
