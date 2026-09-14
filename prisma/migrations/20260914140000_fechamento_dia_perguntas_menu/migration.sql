-- Fase 4 (Parte 2) do Fechamento do Dia — migration de dado puro (sem alteração de schema),
-- mesmo racional de 20260913150000_fechamento_dia_fase4_menu_e_ocorrencias: o deploy
-- automático (scripts/migrate-deploy.sh) só roda `prisma migrate deploy`, nunca
-- `npm run db:seed` — sem este arquivo, a nova subcategoria "Perguntas" (catálogo de
-- perguntas dos formulários, com CRUD) só apareceria pra quem rodasse o seed manualmente, e
-- todo PermissionProfile já existente nasceria sem nenhuma linha de ModulePermission pra
-- "fechamento-dia:perguntas", caindo no fallback de `buildVisibilityResolver` pra chave da
-- categoria inteira (canView=true pra todos) até alguém rodar o seed.
--
-- ON CONFLICT DO NOTHING em tudo: idempotente e nunca sobrescreve uma customização manual já
-- feita na tela de Permissões/menu.

-- 1) Subcategoria "Perguntas" no menu lateral, dentro da categoria "Fechamento do Dia".
INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT '2f6f7b6b-3a19-4e0a-9d0e-9b2b3b6a9c1a', c."id", 'perguntas', 'Perguntas', 'ListChecks', 1, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c
WHERE c."key" = 'fechamento-dia'
ON CONFLICT ("categoryId", "key") DO NOTHING;

-- 2) ModulePermission "fechamento-dia:perguntas" para todo PermissionProfile já existente —
-- mesmo critério exato de "fechamento-dia:ocorrencias" (mesma migração acima citada): só quem
-- já tem canEdit no módulo inteiro (administrador/gestor/gerente/supervisor) gerencia o
-- catálogo de perguntas; canDelete só administrador.
INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canExecute", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_fechamento-dia-perguntas',
  pp."id",
  'fechamento-dia:perguntas',
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;
