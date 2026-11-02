-- A pedido do usuário (itens #151/#152 do backlog): junta a subcategoria "Calendário" do módulo
-- Reservas dentro de "Reservas" (a lista) — a partir de agora o menu lateral de Reservas tem uma
-- subcategoria "Reservas" só, que mostra, na mesma tela, o calendário do mês (com o resumo de
-- ocupação por dia que já existia) empilhado acima da lista/filtros/criação manual que já existia.
-- A pasta/rota própria (src/app/portal/reservas/calendario/) foi removida por completo nesta mesma
-- leva de atualizações; as rotas de API GET /api/reservas/reservas e GET /api/reservas/resumo
-- continuam existindo sem mudança de comportamento (só agregação/leitura), consumidas agora pela
-- mesma tela "Reservas" em vez de telas separadas.
--
-- Mesmo padrão de hard delete já usado em
-- prisma/migrations/20261102030000_remove_relatorios_subcategoria_reservas/migration.sql (que já
-- tinha juntado "Relatórios" com "Visão Geral" dentro deste mesmo módulo) e, antes dela, em
-- prisma/migrations/20260915120000_remove_relatorios_subcategoria_manutencao/migration.sql,
-- 20260915150000_remove_relatorios_subcategoria_universidade/migration.sql,
-- 20260920100000_remove_relatorios_subcategoria_financeiro/migration.sql,
-- 20260921100000_remove_relatorios_subcategoria_estoque/migration.sql e
-- 20260924150000_remove_segmentos_relatorios_subcategoria_crm/migration.sql.
--
-- Importante: só remove a subcategoria "calendario" da categoria "reservas" — filtrada pelo
-- categoryId, igual às migrations anteriores.
DELETE FROM "Subcategory"
WHERE key = 'calendario'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'reservas');
