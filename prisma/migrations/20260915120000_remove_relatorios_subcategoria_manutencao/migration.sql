-- A pedido do usuário: remove do menu lateral a subcategoria "Relatórios" da
-- categoria "Manutenção" (item 6/14 de uma lista de atualizações) — a tela
-- de relatórios (agregação sobre Chamado/Equipamento/Prestador, sem model
-- próprio) e sua rota de API foram removidas por completo nesta mesma leva
-- de atualizações. Mesmo padrão de hard delete já usado em
-- prisma/migrations/20260906190100_remove_marketing_subcategorias_inuteis/migration.sql
-- e prisma/migrations/20260914180000_remove_campanhas_subcategoria_marketing/migration.sql.
--
-- Importante: NÃO mexe nas outras subcategorias "relatorios" (Universidade,
-- Financeiro, Estoque, CRM) — cada uma pertence à sua própria categoria e
-- continua existindo normalmente. Os models Chamado, Equipamento e Prestador
-- também não são tocados aqui: continuam em uso pelas subcategorias
-- Chamados, Equipamentos e Prestadores de Manutenção, que permanecem.
DELETE FROM "Subcategory"
WHERE key = 'relatorios'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'manutencao');
