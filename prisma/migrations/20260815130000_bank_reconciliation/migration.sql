-- CreateEnum
CREATE TYPE "BankTransactionDirection" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "BankTransactionStatus" AS ENUM ('PENDENTE', 'CONCILIADO', 'IGNORADO');

-- CreateTable
CREATE TABLE "BankReconciliationImport" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalEntradas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSaidas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankReconciliationImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "direction" "BankTransactionDirection" NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "status" "BankTransactionStatus" NOT NULL DEFAULT 'PENDENTE',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankReconciliationImport_empresaId_bankAccountId_idx" ON "BankReconciliationImport"("empresaId", "bankAccountId");

-- CreateIndex
CREATE INDEX "BankTransaction_empresaId_bankAccountId_date_idx" ON "BankTransaction"("empresaId", "bankAccountId", "date");

-- CreateIndex
CREATE INDEX "BankTransaction_importId_idx" ON "BankTransaction"("importId");

-- AddForeignKey
ALTER TABLE "BankReconciliationImport" ADD CONSTRAINT "BankReconciliationImport_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationImport" ADD CONSTRAINT "BankReconciliationImport_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationImport" ADD CONSTRAINT "BankReconciliationImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankReconciliationImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
