-- Conciliação Bancária via conexão com o banco (Open Finance).
--
-- Só colunas NOVAS e opcionais (nenhum dado existente muda), mais um único índice por conta:
--   * BankAccount.openFinanceAccountId (único): liga a conta do portal à conta no provedor;
--     lastSyncAt/bankBalance/bankBalanceAt: "última atualização" e saldo informado pelo banco.
--   * BankTransaction.externalId + índice único (bankAccountId, externalId): o mesmo lançamento do
--     banco nunca entra duas vezes (várias linhas sem externalId — extratos de arquivo — continuam
--     permitidas, pois NULL não conflita no Postgres).
--   * BankReconciliationImport.createdById passa a ser opcional (a conexão com o banco grava sem
--     usuário logado); a chave estrangeira passa de RESTRICT para SET NULL.
--
-- DropForeignKey
ALTER TABLE "BankReconciliationImport" DROP CONSTRAINT "BankReconciliationImport_createdById_fkey";

-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN     "bankBalance" DOUBLE PRECISION,
ADD COLUMN     "bankBalanceAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "openFinanceAccountId" TEXT;

-- AlterTable
ALTER TABLE "BankReconciliationImport" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'ARQUIVO',
ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "bankCategory" TEXT,
ADD COLUMN     "counterpart" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "occurredAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "pendingAtBank" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'ARQUIVO';

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_openFinanceAccountId_key" ON "BankAccount"("openFinanceAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_bankAccountId_externalId_key" ON "BankTransaction"("bankAccountId", "externalId");

-- AddForeignKey
ALTER TABLE "BankReconciliationImport" ADD CONSTRAINT "BankReconciliationImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

