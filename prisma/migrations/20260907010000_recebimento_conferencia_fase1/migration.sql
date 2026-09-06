-- CreateEnum
CREATE TYPE "ReceivingItemStatus" AS ENUM ('NAO_CONFERIDO', 'CONFERIDO', 'DIVERGENCIA', 'NAO_RECEBIDO');

-- AlterEnum
ALTER TYPE "PurchaseStatus" ADD VALUE 'EM_CONFERENCIA';

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "exigirFoto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exigirPeso" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exigirTemperatura" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exigirValidade" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "previsaoEntrega" TIMESTAMP(3),
ADD COLUMN     "recebimentoToken" TEXT,
ADD COLUMN     "responsavelRecebimentoId" TEXT;

-- AlterTable
ALTER TABLE "Receiving" ADD COLUMN     "dataFim" TIMESTAMP(3),
ADD COLUMN     "dataInicio" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReceivingItem" (
    "id" TEXT NOT NULL,
    "receivingId" TEXT NOT NULL,
    "purchaseItemId" TEXT NOT NULL,
    "status" "ReceivingItemStatus" NOT NULL DEFAULT 'NAO_CONFERIDO',
    "quantidadeRecebida" DOUBLE PRECISION,
    "pesoAferido" DOUBLE PRECISION,
    "temperaturaAferida" DOUBLE PRECISION,
    "validadeInformada" TIMESTAMP(3),
    "precoInformado" DOUBLE PRECISION,
    "fotoUrl" TEXT,
    "divergenciaTipos" TEXT,
    "divergenciaDescricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReceivingItem_purchaseItemId_key" ON "ReceivingItem"("purchaseItemId");

-- CreateIndex
CREATE INDEX "ReceivingItem_receivingId_idx" ON "ReceivingItem"("receivingId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_recebimentoToken_key" ON "Purchase"("recebimentoToken");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_responsavelRecebimentoId_fkey" FOREIGN KEY ("responsavelRecebimentoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivingItem" ADD CONSTRAINT "ReceivingItem_receivingId_fkey" FOREIGN KEY ("receivingId") REFERENCES "Receiving"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivingItem" ADD CONSTRAINT "ReceivingItem_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

