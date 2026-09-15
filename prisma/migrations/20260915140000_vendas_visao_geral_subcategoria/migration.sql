-- A pedido do usuário: categoria "Vendas" ganha uma subcategoria "Visão Geral" (mesmo
-- conteúdo que já vivia na rota "nua" /portal/vendas — ver
-- src/app/portal/vendas/visao-geral/page.tsx, que reexporta a mesma página de sempre) e a
-- categoria em si deixa de navegar direto ao ser clicada — vira só um agrupador visual no
-- menu lateral. Mesmo padrão (mesma coluna "linked") já usado em
-- prisma/migrations/20260914130000_tarefas_subcategoria_propria/migration.sql para
-- "Tarefas": a coluna já existe desde aquela migração, não precisa ser recriada aqui.

UPDATE "Category" SET "linked" = false WHERE "key" = 'vendas';

-- Abre espaço (order 0) para a nova subcategoria "Visão Geral" antes das 5 subcategorias já
-- existentes de Vendas (lancamentos, faturamento, acompanhamento-vendas, itens-vendidos,
-- garcons — hoje nas orders 0 a 4).
UPDATE "Subcategory"
SET "order" = "order" + 1
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'vendas');

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT 'sub-vendas-visao-geral', "id", 'visao-geral', 'Visão Geral', 'LayoutDashboard', '#2952E3', 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" WHERE "key" = 'vendas'
ON CONFLICT ("categoryId", "key") DO NOTHING;
