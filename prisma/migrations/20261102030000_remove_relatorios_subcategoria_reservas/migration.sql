-- A pedido do usuário: junta a subcategoria "Relatórios" do módulo Reservas dentro de "Visão
-- Geral" — a partir de agora o menu lateral de Reservas só tem "Visão Geral" (que passou a
-- mostrar, na mesma tela, o resumo do dia que já tinha e, abaixo, os agregados por período que
-- antes ficavam em "Relatórios"). A pasta/rota própria (src/app/portal/reservas/relatorios/) foi
-- removida por completo nesta mesma leva de atualizações; a rota de API
-- GET /api/reservas/relatorios continua existindo sem mudança (só agregação/leitura, consumida
-- agora pela tela de Visão Geral em vez da tela de Relatórios).
--
-- Mesmo padrão de hard delete já usado em
-- prisma/migrations/20260915120000_remove_relatorios_subcategoria_manutencao/migration.sql,
-- 20260915150000_remove_relatorios_subcategoria_universidade/migration.sql,
-- 20260920100000_remove_relatorios_subcategoria_financeiro/migration.sql,
-- 20260921100000_remove_relatorios_subcategoria_estoque/migration.sql e
-- 20260924150000_remove_segmentos_relatorios_subcategoria_crm/migration.sql — cada módulo que já
-- teve sua subcategoria "Relatórios" removida antes.
--
-- Importante: NÃO mexe nas outras subcategorias "relatorios" (Manutenção, Universidade,
-- Financeiro, Estoque, CRM já removidas antes; nenhum outro módulo atual tem uma) — só a de
-- Reservas, filtrada pela própria categoria.
DELETE FROM "Subcategory"
WHERE key = 'relatorios'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'reservas');
