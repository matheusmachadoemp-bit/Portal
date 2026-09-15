-- A pedido do usuário: unifica a categoria "Fechamento do Dia" do menu lateral dentro de
-- "Tarefas" — as subcategorias "Ocorrências" (key 'ocorrencias') e "Perguntas" (key
-- 'perguntas'), hoje dentro de "Fechamento do Dia" (key 'fechamento-dia'), passam a viver
-- dentro de "Tarefas" (key 'tarefas'), no fim da ordem das subcategorias que já existem lá
-- ("Tarefas" order 0, "Checklist" order 1 — ver prisma/migrations/20260914130000_tarefas_subcategoria_propria).
-- A categoria "Fechamento do Dia" fica sem nenhuma subcategoria depois disso e deixa de
-- existir como categoria própria do menu.
--
-- Fase 1 (dado/menu) apenas: a pasta de rota física (src/app/portal/fechamento-dia/**), as
-- rotas de API (src/app/api/fechamento-dia/**) e o GATE REAL de tela/API do módulo de
-- permissões ("fechamento-dia" — hasModulePermission, ver src/lib/authz.ts) NÃO mudam de
-- nome: usam a chave literal "fechamento-dia", nunca derivada de Category.key. Mover a pasta
-- de rota e mesclar o conteúdo da tela é a Fase 2, separada, do Caio.
--
-- A VISIBILIDADE DO LINK no menu lateral, por outro lado, É derivada de Category.key/
-- Subcategory.key (buildVisibilityResolver, chamado a partir da chave composta
-- `${categoria.key}:${subcategoria.key}` montada em src/app/portal/layout.tsx) — então mover
-- "Ocorrências"/"Perguntas" para dentro de "Tarefas" muda essa chave composta de
-- "fechamento-dia:ocorrencias"/"perguntas" para "tarefas:ocorrencias"/"perguntas". Sem uma
-- linha de ModulePermission própria pra essa chave nova, o resolver cairia pra permissão da
-- categoria "tarefas" inteira (visível pra todo mundo, líder/funcionário incluídos) — perdendo
-- a restrição atual (só administrador/gestor/gerente/supervisor, isto é, quem tem canEdit no
-- módulo "fechamento-dia" como um todo). A seção 3 abaixo faz o backfill de
-- "tarefas:ocorrencias"/"tarefas:perguntas" pra todo PermissionProfile já existente em
-- produção, replicando exatamente os mesmos flags que as linhas "fechamento-dia:ocorrencias"/
-- "fechamento-dia:perguntas" já têm hoje (criadas por
-- prisma/migrations/20260913150000_fechamento_dia_fase4_menu_e_ocorrencias e
-- prisma/migrations/20260914140000_fechamento_dia_perguntas_menu) — essas duas linhas antigas
-- são mantidas como estão (ficam órfãs, sem efeito, já que a categoria "fechamento-dia" não
-- existe mais no menu, mas não atrapalham nada e preservam o histórico/simetria com o resto
-- do módulo "fechamento-dia", que continua existindo).
--
-- Idempotente por construção, sem precisar de guarda extra:
-- 1) O UPDATE de Subcategory abaixo casa por "categoryId" = id de "fechamento-dia" (subquery).
--    Depois que rodar uma vez, as linhas de "ocorrencias"/"perguntas" já estarão com
--    "categoryId" = id de "tarefas" — uma segunda execução não encontra mais nenhuma linha
--    para mover (0 rows affected), sem erro.
-- 2) O DELETE da categoria "fechamento-dia" só roda depois do UPDATE (mesma migration,
--    mesma transação), quando ela já está garantidamente sem nenhuma subcategoria — sem
--    isso, o "ON DELETE CASCADE" de Subcategory.categoryId apagaria as linhas em vez de
--    preservá-las. Numa segunda execução, a categoria já não existe mais e o DELETE
--    simplesmente não encontra nenhuma linha (0 rows affected), sem erro.
-- 3) Não há risco de duplicar "order" nem violar @@unique([categoryId, key]): "Tarefas" não
--    tem hoje nenhuma subcategoria "ocorrencias"/"perguntas" (só "tarefas"/"checklist", order
--    0/1) — as duas movidas recebem order 2/3, explícitas, sem colidir com as existentes.
-- 4) Os dois INSERT de ModulePermission usam "ON CONFLICT ... DO NOTHING" (mesmo padrão dos
--    backfills anteriores deste módulo): idempotentes e nunca sobrescrevem uma customização
--    manual já feita na tela de Permissões.

-- 1) Move "Ocorrências" e "Perguntas" de "Fechamento do Dia" para "Tarefas".
UPDATE "Subcategory"
SET "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'tarefas'),
    "order" = CASE "key" WHEN 'ocorrencias' THEN 2 WHEN 'perguntas' THEN 3 END
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'fechamento-dia')
  AND "key" IN ('ocorrencias', 'perguntas');

-- 2) "Fechamento do Dia" fica sem nenhuma subcategoria (as únicas duas que tinha foram
--    movidas acima) — remove a categoria, mesmo padrão de hard delete já usado nas remoções
--    de subcategoria anteriores deste projeto (ex.:
--    prisma/migrations/20260914180000_remove_campanhas_subcategoria_marketing,
--    prisma/migrations/20260915120000_remove_relatorios_subcategoria_manutencao,
--    prisma/migrations/20260915150000_remove_relatorios_subcategoria_universidade — nenhuma
--    delas usa "active = false", todas fazem DELETE de verdade).
DELETE FROM "Category"
WHERE "key" = 'fechamento-dia'
  AND NOT EXISTS (SELECT 1 FROM "Subcategory" WHERE "categoryId" = "Category"."id");

-- 3) Backfill de ModulePermission "tarefas:ocorrencias"/"tarefas:perguntas" para todo
--    PermissionProfile já existente — mesmos flags de "fechamento-dia:ocorrencias"/
--    "fechamento-dia:perguntas" (só administrador/gestor/gerente/supervisor com
--    canView/canExecute/canCreate/canEdit; canDelete só administrador), preservando a mesma
--    visibilidade de link no menu que existia antes desta migration.
INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canExecute", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_tarefas-ocorrencias',
  pp."id",
  'tarefas:ocorrencias',
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;

INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canExecute", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_tarefas-perguntas',
  pp."id",
  'tarefas:perguntas',
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;
