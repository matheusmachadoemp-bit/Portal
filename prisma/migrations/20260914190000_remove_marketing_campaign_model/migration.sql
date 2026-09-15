-- A pedido do usuário: remove por completo a funcionalidade de "Campanhas"
-- do módulo Marketing (item 4/14 de uma lista de atualizações). Isso inclui
-- o próprio model MarketingCampaign e o vínculo opcional que MarketingTask
-- tinha com ele (campo "Campanha vinculada" nas telas Tarefas e Calendário
-- de Conteúdo do Marketing, também removido do código nesta mesma
-- atualização).
--
-- Gerado a partir de `prisma migrate diff --from-config-datasource
-- --to-schema prisma/schema.prisma --script` contra um banco local
-- descartável já na baseline de produção, MAS com edição manual: o diff
-- bruto também trazia 3 ALTER FOREIGN KEY (MarketingEntry/Sale/SalesEntry
-- .createdById -> User, de NO ACTION para SET NULL) e um RenameIndex em
-- MetaAdsInsight — drift pré-existente e sem relação com esta mudança
-- (nenhum desses três models foi tocado nesta tarefa), removidos deste
-- arquivo de propósito para não misturar duas mudanças sem relação numa
-- migration só.
--
-- Nota sobre a subcategoria "Campanhas" do CRM (model Campaign/CampaignRecipient,
-- rotas src/app/api/crm/campanhas/**): é uma feature diferente (disparo de
-- campanha por WhatsApp/SMS/Email para segmentos de clientes), sem nenhuma
-- relação com o MarketingCampaign abaixo além do nome parecido — não é
-- afetada por esta migration.

-- DropForeignKey
ALTER TABLE "MarketingCampaign" DROP CONSTRAINT "MarketingCampaign_createdById_fkey";

-- DropForeignKey
ALTER TABLE "MarketingCampaign" DROP CONSTRAINT "MarketingCampaign_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "MarketingCampaign" DROP CONSTRAINT "MarketingCampaign_responsavelId_fkey";

-- DropForeignKey
ALTER TABLE "MarketingTask" DROP CONSTRAINT "MarketingTask_campaignId_fkey";

-- AlterTable
ALTER TABLE "MarketingTask" DROP COLUMN "campaignId";

-- DropTable
DROP TABLE "MarketingCampaign";

-- DropEnum
DROP TYPE "MarketingCampaignStatus";
