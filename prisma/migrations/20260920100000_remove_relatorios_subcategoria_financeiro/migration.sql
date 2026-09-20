-- A pedido do usuário: remove do menu lateral a subcategoria "Relatórios" da
-- categoria "Financeiro". A tela (src/app/portal/financeiro/relatorios/,
-- page.tsx + relatorios-client.tsx) foi removida por completo nesta mesma
-- leva de atualizações; ela apenas consumia rotas de API já compartilhadas
-- com outras telas do módulo (/api/financeiro/pagar, /api/financeiro/receber,
-- /api/financeiro/dre, /api/financeiro/caixa), então nenhuma rota de API foi
-- removida. Mesmo padrão de hard delete já usado em
-- prisma/migrations/20260915120000_remove_relatorios_subcategoria_manutencao/migration.sql
-- e prisma/migrations/20260915150000_remove_relatorios_subcategoria_universidade/migration.sql
-- — Manutenção e Universidade já passaram por essa mesma remoção antes, e
-- agora é a vez do Financeiro.
--
-- Importante: NÃO mexe nas outras subcategorias "relatorios" (Manutenção,
-- Universidade, Estoque, CRM) — cada uma pertence à sua própria categoria e
-- continua existindo normalmente.
DELETE FROM "Subcategory"
WHERE key = 'relatorios'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'financeiro');
