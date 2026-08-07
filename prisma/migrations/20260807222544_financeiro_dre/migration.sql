-- CreateEnum
CREATE TYPE "Company" AS ENUM ('NORD_PIZZA', 'ZARKI_SUSHI', 'GRUPO_NORD');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'TED', 'DOC', 'TRANSFERENCIA', 'CHEQUE', 'OUTRO');

-- CreateEnum
CREATE TYPE "FinanceEntryStatus" AS ENUM ('EM_ABERTO', 'PAGO', 'PARCIALMENTE_PAGO', 'CANCELADO', 'ATRASADO');

-- CreateEnum
CREATE TYPE "FinanceCategoryType" AS ENUM ('RECEITA', 'DESPESA', 'CUSTO', 'INVESTIMENTO');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'APORTE_SOCIO', 'RETIRADA_SOCIO');

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bank" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'Conta Corrente',
    "saldoInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldoAtual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#2952E3',
    "icon" TEXT NOT NULL DEFAULT 'Landmark',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinanceCategoryType" NOT NULL DEFAULT 'DESPESA',
    "dreKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAttachment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringTemplate" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fornecedorCliente" TEXT,
    "categoriaId" TEXT NOT NULL,
    "empresa" "Company" NOT NULL,
    "centroCusto" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "formaPagamento" "PaymentMethod" NOT NULL DEFAULT 'PIX',
    "infinita" BOOLEAN NOT NULL DEFAULT false,
    "quantidadeMeses" INTEGER,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "centroCusto" TEXT,
    "empresa" "Company" NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataCompetencia" TIMESTAMP(3) NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "bankAccountId" TEXT,
    "formaPagamento" "PaymentMethod",
    "parcelado" BOOLEAN NOT NULL DEFAULT false,
    "quantidadeParcelas" INTEGER,
    "parcelaAtual" INTEGER,
    "observacoes" TEXT,
    "status" "FinanceEntryStatus" NOT NULL DEFAULT 'EM_ABERTO',
    "recurringTemplateId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "centroCusto" TEXT,
    "empresa" "Company" NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataCompetencia" TIMESTAMP(3) NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataRecebimento" TIMESTAMP(3),
    "bankAccountId" TEXT,
    "formaRecebimento" "PaymentMethod",
    "parcelado" BOOLEAN NOT NULL DEFAULT false,
    "quantidadeParcelas" INTEGER,
    "parcelaAtual" INTEGER,
    "observacoes" TEXT,
    "status" "FinanceEntryStatus" NOT NULL DEFAULT 'EM_ABERTO',
    "recurringTemplateId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "destinoId" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT,
    "empresa" "Company",
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialCategory_name_key" ON "FinancialCategory"("name");

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
