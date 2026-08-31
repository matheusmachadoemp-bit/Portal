-- CreateTable
CREATE TABLE "ImportedGarcomItem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "employeeId" TEXT,
    "garcomNome" TEXT NOT NULL,
    "categoria" "ProductCategory",
    "item" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "faturamento" DOUBLE PRECISION NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedGarcomItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportedGarcomItem_empresaId_periodFrom_periodTo_idx" ON "ImportedGarcomItem"("empresaId", "periodFrom", "periodTo");

-- AddForeignKey
ALTER TABLE "ImportedGarcomItem" ADD CONSTRAINT "ImportedGarcomItem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedGarcomItem" ADD CONSTRAINT "ImportedGarcomItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
