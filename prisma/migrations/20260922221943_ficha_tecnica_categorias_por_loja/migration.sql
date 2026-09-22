-- AlterEnum
-- Cardápio da Zarki Sushi (segunda loja do Grupo Nord) — antes desses valores existirem, os
-- produtos de sushi eram forçados em COMBO só por ser o valor menos errado disponível no enum.
-- Mesmo padrão de prisma/migrations/20260830210000_payment_method_novos_valores (PAGO_ONLINE/
-- FIADO): `IF NOT EXISTS` por segurança, para o caso de a migration ser reaplicada.
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'SUSHI';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'SASHIMI';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'TEMAKI';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'URAMAKI';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'HOT_ROLL';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'ENTRADA';

-- AlterTable
ALTER TABLE "Subcategory" ADD COLUMN     "empresaId" TEXT;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Dado (não só schema): igual ao precedente
-- prisma/migrations/20260920120000_escala_folgas_menu_subcategoria (e
-- 20260915140000_vendas_visao_geral_subcategoria, 20260905060000_satisfaction_module),
-- scripts/migrate-deploy.sh só roda `prisma migrate deploy` — nunca `npm run db:seed` — então
-- em qualquer banco onde o seed já rodou uma vez no passado (produção incluída, que já tem as
-- 10 subcategorias antigas da Ficha Técnica), só o DDL acima (ALTER TYPE / ADD COLUMN) NÃO
-- seria suficiente: a coluna "empresaId" ficaria NULL em todas as linhas existentes e as 6
-- subcategorias novas de sushi nunca seriam criadas, porque ninguém roda o seed de novo. O
-- prisma/seed.ts já está correto pra banco novo do zero (prisma.subcategory.upsert cobre tudo
-- abaixo automaticamente) — o SQL a seguir é ADICIONAL, só pra cobrir banco já populado.
-- ============================================================================

-- 1) Backfill de empresaId nas 6 subcategorias já existentes que são exclusivas da Nord Pizza &
-- Burger (mesma lista de `empresaKey: "nord-pizza"` em CATEGORIES → "ficha-tecnica" → subs, em
-- prisma/seed.ts). As outras 4 subcategorias antigas (combos, bebidas, drinks, insumos) ficam
-- com empresaId NULL de propósito — continuam compartilhadas entre as duas lojas, igual sempre
-- foram.
UPDATE "Subcategory"
SET "empresaId" = (SELECT "id" FROM "Empresa" WHERE "key" = 'nord-pizza')
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'ficha-tecnica')
  AND "key" IN ('pizzas-salgadas', 'pizzas-doces', 'esfihas-salgadas', 'esfihas-doces', 'acompanhamentos', 'burgers');

-- 2) As 6 subcategorias novas do cardápio da Zarki Sushi (mesmos key/name/icon/order que em
-- CATEGORIES → "ficha-tecnica" → subs em prisma/seed.ts; order contínuo a partir de 10, logo
-- depois de "insumos"=9 — nenhuma subcategoria antiga precisa ser deslocada porque as novas
-- entram no FIM da lista, diferente do precedente de escala-folgas/pesquisa-satisfacao/
-- visão-geral, que abriam espaço no MEIO da lista). "color" não é passado por CATEGORIES pra
-- nenhuma subcategoria de ficha-tecnica, então usa o default do schema ('#2952E3'), igual as
-- 10 antigas. ON CONFLICT DO NOTHING: idempotente e nunca sobrescreve uma customização manual
-- já feita na tela de Permissões/menu, e também não duplica se esta migration rodar num banco
-- onde `db:seed` já tiver criado essas mesmas linhas primeiro (banco novo do zero + seed).
INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "empresaId", "createdAt", "updatedAt")
SELECT 'sub-ficha-tecnica-entradas', c."id", 'entradas', 'Entradas', 'Soup', '#2952E3', 10, true, true, e."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c, "Empresa" e WHERE c."key" = 'ficha-tecnica' AND e."key" = 'zarki-sushi'
ON CONFLICT ("categoryId", "key") DO NOTHING;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "empresaId", "createdAt", "updatedAt")
SELECT 'sub-ficha-tecnica-sashimis', c."id", 'sashimis', 'Sashimis', 'Fish', '#2952E3', 11, true, true, e."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c, "Empresa" e WHERE c."key" = 'ficha-tecnica' AND e."key" = 'zarki-sushi'
ON CONFLICT ("categoryId", "key") DO NOTHING;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "empresaId", "createdAt", "updatedAt")
SELECT 'sub-ficha-tecnica-sushis', c."id", 'sushis', 'Sushis', 'Utensils', '#2952E3', 12, true, true, e."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c, "Empresa" e WHERE c."key" = 'ficha-tecnica' AND e."key" = 'zarki-sushi'
ON CONFLICT ("categoryId", "key") DO NOTHING;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "empresaId", "createdAt", "updatedAt")
SELECT 'sub-ficha-tecnica-temakis', c."id", 'temakis', 'Temakis', 'IceCreamCone', '#2952E3', 13, true, true, e."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c, "Empresa" e WHERE c."key" = 'ficha-tecnica' AND e."key" = 'zarki-sushi'
ON CONFLICT ("categoryId", "key") DO NOTHING;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "empresaId", "createdAt", "updatedAt")
SELECT 'sub-ficha-tecnica-uramakis', c."id", 'uramakis', 'Uramakis', 'Layers', '#2952E3', 14, true, true, e."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c, "Empresa" e WHERE c."key" = 'ficha-tecnica' AND e."key" = 'zarki-sushi'
ON CONFLICT ("categoryId", "key") DO NOTHING;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "empresaId", "createdAt", "updatedAt")
SELECT 'sub-ficha-tecnica-hot-rolls', c."id", 'hot-rolls', 'Hot Rolls', 'Flame', '#2952E3', 15, true, true, e."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c, "Empresa" e WHERE c."key" = 'ficha-tecnica' AND e."key" = 'zarki-sushi'
ON CONFLICT ("categoryId", "key") DO NOTHING;

-- 3) Produto de exemplo da Zarki Sushi ("Uramaki Cream Cheese 8 peças", code SK-002, criado pelo
-- seed original antes de existirem as categorias de sushi — ver comentário em CATEGORIES →
-- "ficha-tecnica" em prisma/seed.ts) estava forçado em COMBO só por ser o valor menos errado
-- disponível no enum na época; prisma/seed.ts já corrige isso pra banco novo do zero
-- (category: "URAMAKI" direto no create), então este UPDATE só produz efeito em banco onde o
-- seed ANTIGO já rodou (o `code` é @unique em Product, então o WHERE resolve sozinho — se o
-- produto ainda não existir, ex. banco novo do zero antes do seed rodar, não encontra nenhuma
-- linha e não faz nada, sem erro).
UPDATE "Product" SET "category" = 'URAMAKI'
WHERE "code" = 'SK-002' AND "empresaId" = (SELECT "id" FROM "Empresa" WHERE "key" = 'zarki-sushi');
