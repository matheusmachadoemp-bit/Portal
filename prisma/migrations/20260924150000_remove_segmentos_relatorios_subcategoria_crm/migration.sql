-- A pedido do usuário: remove por completo (menu + tela + rotas) as
-- subcategorias "Segmentos" e "Relatórios" da categoria "CRM" no menu
-- lateral.
--
-- "Análise RFV" (key "rfv") NÃO precisa de limpeza aqui: já não existe mais
-- como subcategoria no menu (foi removida do seed antes mesmo de o módulo
-- CRM chegar à produção, dentro da mesma leva de commits que introduziu a
-- subcategoria "Inteligência de Cliente" em seu lugar) — só sobrou uma
-- página solta (redirect de 4 linhas para /portal/crm/inteligencia), também
-- removida do código nesta mesma atualização, sem contrapartida de banco.
--
-- As telas de Segmentos (src/app/portal/crm/segmentos/) e Relatórios
-- (src/app/portal/crm/relatorios/) foram removidas por completo do código
-- nesta mesma atualização, junto com as 2 rotas de API dedicadas de
-- Segmentos (src/app/api/crm/segmentos/). O model `CrmSegment` (e a tabela
-- correspondente) NÃO foi removido — pode já existir segmento salvo por
-- algum usuário; só deixou de ter qualquer tela/rota usando ele.
--
-- Mesmo padrão de hard delete já usado nas remoções anteriores de
-- subcategoria "relatorios" de outros módulos (Manutenção, Universidade,
-- Financeiro, Estoque) — ver
-- prisma/migrations/20260921100000_remove_relatorios_subcategoria_estoque/migration.sql.
--
-- Importante: NÃO mexe nas outras subcategorias "relatorios" (Manutenção,
-- Universidade, Financeiro, Estoque) — cada uma pertence à sua própria
-- categoria e continua existindo normalmente.
DELETE FROM "Subcategory"
WHERE key IN ('segmentos', 'relatorios')
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'crm');
