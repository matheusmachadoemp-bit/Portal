-- Backfill de dado já gravado em ModulePermission — sem mudança de schema (as colunas
-- canCreate/canEdit/canDelete já existiam desde a migration "permission_profiles").
--
-- Parte 1 — dois módulos que faltavam na constante MODULES (src/lib/permissions.ts):
-- "reuniao" e "loja-nord" existem no catálogo de categorias do menu (CATEGORIES em
-- prisma/seed.ts / tabela Category) desde que os módulos Reunião e Loja Nord foram criados, mas
-- nunca entraram em MODULES. Como visibleModuleKeys() só libera no menu lateral um módulo que
-- tenha uma linha de ModulePermission com canView = true, e nenhum PermissionProfile já gravado
-- em banco tem essa linha para "reuniao"/"loja-nord" (elas nunca foram criadas, nem pelo seed nem
-- pela tela de Permissões, porque o módulo não existia na constante), os dois módulos
-- desapareceram silenciosamente do menu de qualquer usuário com um perfil de permissão atribuído.
-- Corrigir só a constante MODULES (feito em src/lib/permissions.ts) resolve isso para um banco
-- novo (seed do zero), mas não por si só para o banco já em produção — por isso, assim como a
-- migration "loja_nord_menu" já fez o mesmo para Category/Subcategory, criamos aqui as linhas de
-- ModulePermission que faltam para essas duas chaves, para todo PermissionProfile já existente,
-- aplicadas automaticamente no próximo `prisma migrate deploy` (sem depender de rodar
-- `npm run db:seed` manualmente em produção). ON CONFLICT DO NOTHING torna isso seguro mesmo que
-- o seed também rode depois.
--
-- Parte 2 — canCreate/canEdit/canDelete sempre `false` para todo perfil não-administrador: o seed
-- sempre gravou essas 3 colunas como `false` para qualquer perfil diferente de "administrador"
-- (só canView = true), porque elas nunca tiveram efeito real em nenhuma rota até agora. Corrigimos
-- o seed (prisma/seed.ts) para gerar essas flags a partir de
-- ACCESS_LEVEL_TO_MODULE_FLAGS[defaultLevelForProfileKey(profile.key)]
-- (src/lib/permissions.ts) — a mesma fonte da verdade dos checks de cargo já espalhados pelas
-- rotas — mas isso só vale para seeds futuros; os dados já gravados em produção continuam errados
-- até este backfill. Mapeamento aplicado (ver comentário completo em
-- ACCESS_LEVEL_TO_MODULE_FLAGS/defaultLevelForRole em src/lib/permissions.ts):
--   - perfis "gestor", "gerente", "supervisor" -> nível EDITAR (canCreate/canEdit = true,
--     canDelete = false);
--   - demais perfis não-administrador ("funcionario", "lider", "marketing", "financeiro" — os 3
--     últimos sem Role equivalente no enum, tratados com o mesmo nível "default" da função,
--     COLABORADOR -> VISUALIZAR) -> canCreate/canEdit/canDelete continuam `false` (já é o valor
--     gravado hoje; statement incluído por completude/idempotência, não por haver algo para
--     corrigir de fato nesses perfis).
-- O perfil "administrador" já é gravado com as 4 flags `true` desde a criação do perfil e não é
-- tocado por nenhum dos dois UPDATEs abaixo (nunca aparece nas listas IN (...)).
--
-- Por que não tocamos em "canView" neste backfill: diferente de canCreate/canEdit/canDelete,
-- canView já controla algo real hoje (visibilidade do módulo no menu lateral) desde que a tela de
-- Permissões existe — é plausível que algum admin já tenha desmarcado "Ver" de algum módulo para
-- algum perfil de propósito, e não há coluna de auditoria por linha em ModulePermission para
-- confirmar isso com segurança. Como o bug relatado é especificamente sobre
-- canCreate/canEdit/canDelete (nunca tiveram efeito, logo nunca haveria razão para alguém tê-los
-- customizado), o backfill abaixo mexe só nessas 3 colunas, e restringe-se a perfis com
-- isSystem = true (hoje, todo PermissionProfile em produção é isSystem = true — não existe tela
-- de criação de perfil customizado —, mas mantemos o filtro para não sobrescrever um eventual
-- perfil customizado no futuro).

-- Parte 1: cria as linhas de ModulePermission que faltam para "reuniao" e "loja-nord", para todo
-- perfil já existente, com as mesmas flags que o seed corrigido geraria hoje. Sem filtro de
-- isSystem aqui (diferente da Parte 2): isto só faz INSERT de combinações (profileId, moduleKey)
-- que ainda não existem (ON CONFLICT DO NOTHING), nunca sobrescreve nada, então não há risco de
-- perder uma customização manual — e um eventual perfil customizado no futuro (isSystem = false)
-- também precisa dessa linha, senão sofre o mesmo bug do Problema 1 (módulo some do menu).
INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_reuniao',
  pp."id",
  'reuniao',
  true,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;

INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_loja-nord',
  pp."id",
  'loja-nord',
  true,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;

-- Parte 2: corrige canCreate/canEdit/canDelete dos perfis do sistema já gravados (em todos os
-- módulos, incluindo as linhas de "reuniao"/"loja-nord" recém-criadas acima — o UPDATE é
-- idempotente e não conflita com os valores já inseridos na Parte 1).
UPDATE "ModulePermission" mp
SET "canCreate" = true, "canEdit" = true, "canDelete" = false
FROM "PermissionProfile" pp
WHERE mp."profileId" = pp."id"
  AND pp."isSystem" = true
  AND pp."key" IN ('gestor', 'gerente', 'supervisor');

UPDATE "ModulePermission" mp
SET "canCreate" = false, "canEdit" = false, "canDelete" = false
FROM "PermissionProfile" pp
WHERE mp."profileId" = pp."id"
  AND pp."isSystem" = true
  AND pp."key" IN ('funcionario', 'lider', 'marketing', 'financeiro');
