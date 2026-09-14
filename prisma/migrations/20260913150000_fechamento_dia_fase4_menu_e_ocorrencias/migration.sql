-- Fase 4 (Parte 1) do Fechamento do Dia — migration de dado puro (sem alteração de schema),
-- mesmo racional de prisma/migrations/20260905053100_loja_nord_menu (Category/Subcategory) e
-- 20260912200000_fechamento_dia_fase1 (backfill de ModulePermission): o deploy automático
-- (scripts/migrate-deploy.sh) só roda `prisma migrate deploy`, nunca `npm run db:seed` — sem
-- este arquivo, o item "Fechamento do Dia" só apareceria no menu lateral de quem rodasse o seed
-- manualmente em produção depois do deploy, e a subcategoria "Ocorrências" (todo
-- PermissionProfile já existente nasceria sem nenhuma linha de ModulePermission pra
-- "fechamento-dia:ocorrencias") cairia no fallback de `buildVisibilityResolver` pra chave da
-- categoria inteira (canView=true pra todos) até alguém rodar o seed — o oposto do que a Parte 1
-- decidiu (só administrador/gestor/gerente/supervisor, o grupo com canEdit no módulo).
--
-- Só cria a categoria + UMA subcategoria ("Ocorrências") — ver o comentário completo em
-- CATEGORIES (prisma/seed.ts) sobre por que não existe uma segunda subcategoria "Status do Dia"
-- (a categoria em si, clicada diretamente, já leva pra `/portal/fechamento-dia`).
--
-- ON CONFLICT DO NOTHING em tudo: idempotente e nunca sobrescreve uma customização manual já
-- feita na tela de Permissões/menu (mesma regra dos dois precedentes citados acima).

-- 1) Categoria "Fechamento do Dia" + subcategoria "Ocorrências" no menu lateral.
INSERT INTO "Category" ("id", "key", "name", "icon", "order", "active", "isSystem", "contentType", "createdAt", "updatedAt")
VALUES ('861130dc-203f-4707-88dc-7203ff6539fd', 'fechamento-dia', 'Fechamento do Dia', 'Sunset', 19, true, true, 'fechamento-dia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT '4668a92a-0d7a-476c-a021-1430103d6497', c."id", 'ocorrencias', 'Ocorrências', 'AlertTriangle', 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c
WHERE c."key" = 'fechamento-dia'
ON CONFLICT ("categoryId", "key") DO NOTHING;

-- 2) ModulePermission "fechamento-dia:ocorrencias" para todo PermissionProfile já existente —
-- canView/canExecute/canCreate/canEdit reaproveitam a mesma condição "tem canEdit no módulo"
-- (administrador/gestor/gerente/supervisor) que o backfill de "fechamento-dia" (módulo inteiro)
-- em 20260912200000_fechamento_dia_fase1 já usa pra canExecute/canCreate/canEdit — aqui também
-- pra canView, de propósito (é o que torna a subcategoria mais restrita que a categoria pra
-- líder/funcionário/marketing/financeiro). canDelete só administrador, mesmo critério de sempre.
INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canExecute", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_fechamento-dia-ocorrencias',
  pp."id",
  'fechamento-dia:ocorrencias',
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;
