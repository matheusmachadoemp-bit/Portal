-- A pedido do usuário: remove do menu lateral a subcategoria "Relatórios" da
-- categoria "Estoque". A tela (src/app/portal/estoque/relatorios/,
-- page.tsx + relatorios-client.tsx) foi removida por completo nesta mesma
-- leva de atualizações; ela apenas consumia Prisma direto e utilitários
-- compartilhados (@/lib/estoque, @/lib/export-utils, @/lib/empresa,
-- @/lib/authz), sem nenhuma rota de API própria, então nenhuma rota foi
-- removida. Mesmo padrão de hard delete já usado em
-- prisma/migrations/20260915120000_remove_relatorios_subcategoria_manutencao/migration.sql,
-- prisma/migrations/20260915150000_remove_relatorios_subcategoria_universidade/migration.sql
-- e prisma/migrations/20260920100000_remove_relatorios_subcategoria_financeiro/migration.sql
-- — Manutenção, Universidade e Financeiro já passaram por essa mesma remoção
-- antes, e agora é a vez do Estoque.
--
-- Importante: NÃO mexe nas outras subcategorias "relatorios" (Manutenção,
-- Universidade, Financeiro, CRM) — cada uma pertence à sua própria categoria
-- e continua existindo normalmente.
DELETE FROM "Subcategory"
WHERE key = 'relatorios'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'estoque');
