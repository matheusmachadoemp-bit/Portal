-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "quantidadeRecebida" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Receiving_empresaId_dataHora_idx" ON "Receiving"("empresaId", "dataHora");
