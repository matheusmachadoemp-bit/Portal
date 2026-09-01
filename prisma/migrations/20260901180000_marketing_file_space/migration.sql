-- Separa os arquivos da Biblioteca de Arquivos dos arquivos da aba
-- "Google Drive" (que passou a gerenciar arquivos nativamente, em vez de
-- só incorporar uma pasta externa do Google Drive).

-- AlterTable
ALTER TABLE "MarketingFile" ADD COLUMN "space" TEXT NOT NULL DEFAULT 'biblioteca';
