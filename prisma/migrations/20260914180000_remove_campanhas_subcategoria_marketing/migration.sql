-- A pedido do usuário: remove do menu lateral a subcategoria "Campanhas" da
-- categoria "Marketing" (item 4/14 de uma lista de atualizações) — a
-- funcionalidade de campanhas de marketing (página, rotas de API e model
-- MarketingCampaign) foi removida por completo nesta mesma leva de
-- atualizações. Mesmo padrão de hard delete já usado em
-- prisma/migrations/20260906190100_remove_marketing_subcategorias_inuteis/migration.sql.
--
-- Importante: NÃO mexe na subcategoria "Campanhas" da categoria "CRM" (essa
-- é outra funcionalidade completamente diferente — disparo de campanha por
-- WhatsApp/SMS/Email para segmentos de clientes, model Campaign/CampaignRecipient
-- — que continua existindo normalmente).
DELETE FROM "Subcategory"
WHERE key = 'campanhas'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'marketing');
