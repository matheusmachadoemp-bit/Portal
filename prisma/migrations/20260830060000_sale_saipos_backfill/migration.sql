-- AlterTable: Sale ganha rastreio de origem (manual/Saipos) e vínculo com a venda importada da Saipos.
-- Idempotente (IF NOT EXISTS) porque parte destas colunas já foi aplicada manualmente em produção
-- por uma rota de migração temporária de uma tentativa anterior desta mesma funcionalidade.
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "source" "SalesEntrySource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "saiposSaleId" TEXT;
ALTER TABLE "Sale" ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_empresaId_saiposSaleId_key" ON "Sale"("empresaId", "saiposSaleId");
