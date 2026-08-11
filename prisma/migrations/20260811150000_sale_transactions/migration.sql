-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'VOUCHER';

-- AlterEnum
ALTER TYPE "ProductCategory" ADD VALUE 'SOBREMESA';

-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('SALAO', 'DELIVERY', 'BALCAO');

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "channel" "SaleChannel" NOT NULL DEFAULT 'SALAO',
    "formaPagamento" "PaymentMethod" NOT NULL DEFAULT 'OUTRO',
    "garcomId" TEXT,
    "mesaNumero" TEXT,
    "bairro" TEXT,
    "regiao" TEXT,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "nome" TEXT NOT NULL,
    "categoria" "ProductCategory",
    "quantidade" DOUBLE PRECISION NOT NULL,
    "precoUnitario" DOUBLE PRECISION NOT NULL,
    "faturamento" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sale_empresaId_dateTime_idx" ON "Sale"("empresaId", "dateTime");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_garcomId_fkey" FOREIGN KEY ("garcomId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
