-- A pedido do usuário: remove do menu lateral a subcategoria "Contas
-- Bancárias" da categoria "Financeiro". A funcionalidade não foi apagada —
-- ela passou a viver dentro da tela "Caixa da Empresa" (logo abaixo da
-- seção "Movimentações do caixa"), na mesma rota
-- /portal/financeiro/caixa-da-empresa, então a tela própria antiga
-- (src/app/portal/financeiro/contas-bancarias/, page.tsx +
-- contas-bancarias-client.tsx) foi removida. As rotas de API
-- (/api/financeiro/bank-accounts/**) continuam exatamente as mesmas,
-- consumidas agora pela tela de Caixa da Empresa. Mesmo padrão de hard
-- delete já usado em
-- prisma/migrations/20260915120000_remove_relatorios_subcategoria_manutencao/migration.sql,
-- prisma/migrations/20260915150000_remove_relatorios_subcategoria_universidade/migration.sql
-- e, mais recentemente,
-- prisma/migrations/20260920100000_remove_relatorios_subcategoria_financeiro/migration.sql
-- (a própria categoria Financeiro já perdeu a subcategoria "Relatórios" por
-- esse mesmo motivo, pouco antes desta).
--
-- Importante: NÃO mexe nas outras subcategorias "contas-bancarias" de
-- outras categorias, se existirem — o filtro por categoryId = financeiro
-- garante isso.
DELETE FROM "Subcategory"
WHERE key = 'contas-bancarias'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'financeiro');
