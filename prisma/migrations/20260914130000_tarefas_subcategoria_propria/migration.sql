-- Categoria "Tarefas" ganha uma subcategoria própria ("Tarefas", apontando pro quadro
-- principal em /portal/tarefas/tarefas) e deixa de navegar direto ao ser clicada — vira só
-- um agrupador visual no menu lateral, igual ao padrão que as outras categorias com
-- subcategorias já seguem para escolher uma tela específica em vez da rota "nua".

ALTER TABLE "Category" ADD COLUMN "linked" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Category" SET "linked" = false WHERE "key" = 'tarefas';

-- Abre espaço (order 0) para a nova subcategoria "Tarefas" antes da "Checklist" existente.
UPDATE "Subcategory"
SET "order" = "order" + 1
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'tarefas')
  AND "key" = 'checklist';

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT 'sub-tarefas-tarefas', "id", 'tarefas', 'Tarefas', 'ListChecks', '#2952E3', 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" WHERE "key" = 'tarefas'
ON CONFLICT ("categoryId", "key") DO NOTHING;
