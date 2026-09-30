-- A pedido do usuário: a subcategoria "Transferências" (key "transferencias") da categoria
-- "Estoque" deixa de existir separada no menu lateral. A tela
-- (src/app/portal/estoque/transferencias/) foi removida por completo nesta mesma leva de
-- atualizações; a capacidade de solicitar/gerenciar transferência entre lojas passou a viver
-- dentro da subcategoria "Movimentações" (mesmo model `Transfer`/`TransferItem` e mesmas rotas
-- /api/estoque/transferencias/** de sempre — só o ponto de entrada no menu mudou). Mesmo padrão
-- de hard delete já usado em
-- prisma/migrations/20260921100000_remove_relatorios_subcategoria_estoque/migration.sql e
-- irmãos (Manutenção, Universidade, Financeiro, CRM) — ver comentário lá.
--
-- Importante: não mexe nas rotas de API /api/estoque/transferencias/**, que continuam existindo
-- e são consumidas agora pela tela de Movimentações.
DELETE FROM "Subcategory"
WHERE key = 'transferencias'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'estoque');
