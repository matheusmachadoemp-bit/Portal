-- Clicar numa categoria com subcategorias agora só expande o menu (nunca navega). Marketing, CMV e
-- Metas têm conteúdo próprio na página raiz (/portal/marketing, /portal/cmv, /portal/metas) sem
-- nenhuma subcategoria apontando pra ele — ficariam inalcançáveis pelo menu. Cada uma ganha uma
-- subcategoria "Visão Geral" (rota própria que reexporta a página raiz — ver
-- src/app/portal/{marketing,cmv,metas}/visao-geral/page.tsx), mesmo padrão de
-- 20260915140000_vendas_visao_geral_subcategoria. Só desloca as demais subcategorias (order + 1)
-- se a "Visão Geral" ainda não existe, e o INSERT é idempotente.

UPDATE "Subcategory"
SET "order" = "order" + 1
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing')
  AND NOT EXISTS (
    SELECT 1 FROM "Subcategory" s
    WHERE s."categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing') AND s."key" = 'visao-geral'
  );

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT 'sub-marketing-visao-geral', "id", 'visao-geral', 'Visão Geral', 'LayoutDashboard', '#2952E3', 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" WHERE "key" = 'marketing'
ON CONFLICT ("categoryId", "key") DO NOTHING;

UPDATE "Subcategory"
SET "order" = "order" + 1
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'cmv')
  AND NOT EXISTS (
    SELECT 1 FROM "Subcategory" s
    WHERE s."categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'cmv') AND s."key" = 'visao-geral'
  );

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT 'sub-cmv-visao-geral', "id", 'visao-geral', 'Visão Geral', 'LayoutDashboard', '#2952E3', 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" WHERE "key" = 'cmv'
ON CONFLICT ("categoryId", "key") DO NOTHING;

UPDATE "Subcategory"
SET "order" = "order" + 1
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'metas')
  AND NOT EXISTS (
    SELECT 1 FROM "Subcategory" s
    WHERE s."categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'metas') AND s."key" = 'visao-geral'
  );

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT 'sub-metas-visao-geral', "id", 'visao-geral', 'Visão Geral', 'LayoutDashboard', '#2952E3', 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" WHERE "key" = 'metas'
ON CONFLICT ("categoryId", "key") DO NOTHING;
