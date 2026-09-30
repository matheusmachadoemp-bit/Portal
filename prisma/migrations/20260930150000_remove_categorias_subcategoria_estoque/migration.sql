-- A pedido do usuário: remove do menu lateral a subcategoria "Categorias" (key
-- "categorias") da categoria "Estoque". As telas Estoque > Produtos e Estoque >
-- Categorias foram unificadas numa única subcategoria, "Produtos", que passa a
-- absorver o conteúdo de Categorias (unificação de tela feita à parte, fora
-- desta migration). As rotas de API /api/estoque/categorias/** continuam
-- existindo normalmente e passam a ser consumidas pela tela unificada de
-- Produtos. Mesmo padrão de hard delete já usado em
-- prisma/migrations/20260921100000_remove_relatorios_subcategoria_estoque/migration.sql,
-- prisma/migrations/20260930130000_remove_transferencias_subcategoria_estoque/migration.sql
-- e prisma/migrations/20260930140000_remove_configuracoes_subcategoria_estoque/migration.sql
-- (o próprio Estoque já tinha perdido "Relatórios", "Transferências" e
-- "Configurações" por esse mesmo motivo, antes desta).
--
-- Importante: o filtro por categoryId = estoque garante que só a subcategoria
-- "categorias" da categoria Estoque é afetada, mesmo que outra categoria
-- venha a ter uma subcategoria de mesma key no futuro. Esta migration também
-- não mexe nas rotas /api/estoque/categorias/** nem na tela
-- src/app/portal/estoque/categorias/ (remoção da tela é feita à parte).
DELETE FROM "Subcategory"
WHERE key = 'categorias'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'estoque');
