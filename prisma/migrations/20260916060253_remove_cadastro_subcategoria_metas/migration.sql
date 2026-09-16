-- A tela central de cadastro de metas (/portal/metas/cadastro) foi removida na
-- Fase 2 (visual, Caio) do redesenho de Metas: cada subcategoria de Metas
-- (Gerência, Salão, Cozinha, Delivery, Marketing, Administrativo) agora tem
-- autonomia própria pra lançar/editar suas metas direto no card, sem precisar
-- de uma tela de cadastro central. A entrada "Cadastrar Metas" continuava no
-- menu lateral (key 'cadastro' da categoria 'metas') e levava a um 404 real,
-- já que a rota de página não existe mais. Remove a subcategoria do menu.
--
-- Mesmo padrão de hard delete já usado nas remoções anteriores de
-- subcategoria deste projeto (nenhuma usa "active = false", todas fazem
-- DELETE de verdade):
-- prisma/migrations/20260914180000_remove_campanhas_subcategoria_marketing
-- prisma/migrations/20260915120000_remove_relatorios_subcategoria_manutencao
-- prisma/migrations/20260915150000_remove_relatorios_subcategoria_universidade
--
-- ModulePermission.moduleKey é só uma String (sem FK/cascade — ver
-- model ModulePermission em prisma/schema.prisma), então uma eventual linha
-- "metas:cadastro" fica órfã sem efeito nenhum (nunca mais é lida, já que o
-- link nem existe mais no menu) — mesmo comportamento aceito nas três
-- remoções de subcategoria acima, nenhuma delas limpou ModulePermission.
DELETE FROM "Subcategory"
WHERE key = 'cadastro'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'metas');
