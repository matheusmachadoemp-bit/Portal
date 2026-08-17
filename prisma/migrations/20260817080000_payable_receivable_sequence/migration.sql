-- Numeração sequencial de Contas a Pagar/Receber via coluna autoincrement
-- (backed por sequence do Postgres) em vez de COUNT(*) na hora do POST,
-- que tinha condição de corrida real entre requisições simultâneas.

-- AlterTable
ALTER TABLE "Payable" ADD COLUMN "sequence" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "Receivable" ADD COLUMN "sequence" SERIAL NOT NULL;
