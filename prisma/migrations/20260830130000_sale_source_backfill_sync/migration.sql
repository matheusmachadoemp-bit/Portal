-- Sincroniza o schema com colunas que já existem na produção: uma migração
-- de outra sessão ("sale_saipos_backfill") aplicou parcialmente mudanças na
-- tabela "Sale" (colunas "source" e "saiposSaleId", e tornou "createdById"
-- opcional) antes de falhar num passo seguinte, e nunca chegou a ser
-- registrada no histórico de migrações do Git. Esta migração recria o
-- mesmo resultado de forma segura para re-executar, para que o schema do
-- repositório volte a refletir o banco de produção e os próximos deploys
-- parem de travar.
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "source" "SalesEntrySource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "saiposSaleId" TEXT;
ALTER TABLE "Sale" ALTER COLUMN "createdById" DROP NOT NULL;
