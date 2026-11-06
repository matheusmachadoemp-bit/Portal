-- A pedido do usuário: junta a subcategoria "Indicadores" do módulo Produção dentro de "Visão
-- Geral" — a partir de agora o menu lateral de Produção deixa de mostrar "Indicadores" como item
-- separado; a tela "Visão Geral" passa a exibir, na mesma página, o conteúdo que antes ficava em
-- "Indicadores" (tarefa visual do Caio, feita em seguida desta migration). A pasta/rota própria
-- (src/app/portal/producao/indicadores/) e a rota de API (GET/POST /api/producao/indicadores)
-- continuam existindo sem mudança nenhuma — só passam a ser consumidas a partir da tela de Visão
-- Geral em vez da tela de Indicadores.
--
-- Diferente do padrão de hard DELETE usado antes pra remover subcategoria "Relatórios" (ver
-- prisma/migrations/20261102030000_remove_relatorios_subcategoria_reservas e as migrations
-- análogas de Manutenção/Universidade/Financeiro/Estoque/CRM citadas lá), aqui a linha é só
-- desativada (active = false), nunca excluída — mesmo padrão já usado em
-- prisma/migrations/20261105010000_escala_folgas_eventos (UPDATE "DayOffType" SET "ativo" =
-- false ...): existe FK de Subcategory sem CASCADE (FeedbackReport.subcategoriaId, ver
-- prisma/schema.prisma) que poderia referenciar esta linha (ex.: um colaborador já registrou um
-- feedback com "Produção > Indicadores" como módulo afetado) — excluir quebraria essa referência
-- (ou a própria migration falharia por violação de FK). Com active = false a linha para de
-- aparecer no menu lateral (sidebar já filtra por Subcategory.active) sem arrastar nenhuma
-- referência existente.
--
-- Importante: filtra pela categoria pai ("producao") além da key, pra nunca acertar por engano
-- uma subcategoria "indicadores" de outro módulo — confirmado (buscando por `key: "indicadores"`
-- em todo o prisma/seed.ts) que esta é a ÚNICA subcategoria "indicadores" cadastrada no sistema,
-- mas o filtro pela categoria pai é mantido por segurança/clareza mesmo assim.
UPDATE "Subcategory"
SET "active" = false
WHERE "key" = 'indicadores'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'producao');
