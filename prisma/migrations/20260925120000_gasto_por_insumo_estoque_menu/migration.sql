-- Nova subcategoria de menu lateral: "Gasto por Insumo" (dentro de Estoque). A tela
-- (src/app/portal/estoque/gasto-por-insumo/page.tsx, rota física própria) e o backend
-- (computeGastoPorInsumoRows, em src/lib/recebimento-server.ts) já foram publicados (PR #416
-- backend, PR #421 tela) — só faltava o item de menu.
--
-- Posicionada logo depois de "recebimento": é o mesmo dado de origem (quantidade/valor
-- recebido por insumo no período). Gate de permissão da página é
-- `hasModulePermission(..., "estoque", "canView")`, sem subcategoria — igual às demais
-- subcategorias de Estoque sem override próprio, cai pro nível de módulo "estoque"
-- (buildVisibilityResolver, @/lib/permissions, e hasModulePermission, @/lib/authz), então não
-- precisa de nenhuma linha extra de permissão.
--
-- "order" calculado a partir do valor atual de "recebimento" em produção (não um literal
-- fixo): a lista de subcategorias de Estoque não é mais uma sequência contígua 0..N-1 — teve
-- itens removidos sem renumerar os irmãos (prisma/migrations/20260910010000_unifica_contagem_semanal_mensal,
-- prisma/migrations/20260921100000_remove_relatorios_subcategoria_estoque) e "Divergências de
-- Recebimento" entrou com "order" literal 16
-- (prisma/migrations/20260907150000_recebimento_divergencias_central). Por isso o valor de
-- "recebimento" é lido em tempo de execução: tudo que já tiver "order" maior que o dele em
-- Estoque (divergencias-recebimento, movimentacoes, transferencias, perdas, configuracoes —
-- sejam quais forem os valores reais em produção) é empurrado +1, abrindo espaço logo em
-- seguida para a subcategoria nova.
UPDATE "Subcategory"
SET "order" = "order" + 1
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'estoque')
  AND "order" > (
    SELECT "order" FROM "Subcategory"
    WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'estoque')
      AND "key" = 'recebimento'
  );

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT
  'sub-estoque-gasto-por-insumo',
  c."id",
  'gasto-por-insumo',
  'Gasto por Insumo',
  'ChartColumn',
  '#2952E3',
  r."order" + 1,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Category" c
JOIN "Subcategory" r ON r."categoryId" = c."id" AND r."key" = 'recebimento'
WHERE c."key" = 'estoque'
ON CONFLICT ("categoryId", "key") DO NOTHING;
