-- CreateTable
CREATE TABLE "ImportedSaleItem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "productId" TEXT,
    "nome" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "faturamento" DOUBLE PRECISION NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportedSaleItem_empresaId_periodFrom_periodTo_idx" ON "ImportedSaleItem"("empresaId", "periodFrom", "periodTo");

-- AddForeignKey
ALTER TABLE "ImportedSaleItem" ADD CONSTRAINT "ImportedSaleItem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedSaleItem" ADD CONSTRAINT "ImportedSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
