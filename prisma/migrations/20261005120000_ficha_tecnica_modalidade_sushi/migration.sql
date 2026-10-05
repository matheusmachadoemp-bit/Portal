-- Reorganização das abas da Ficha Técnica da Zarki Sushi: as 7 subcategorias por TIPO de prato
-- (Entradas, Sashimis, Sushis, Temakis, Uramakis, Hot Rolls + a aba compartilhada "Sobremesas")
-- são substituídas por 3 subcategorias por MODALIDADE de venda (Delivery, À La Carte, Rodízio).
-- A pedido do Matheus: cada modalidade passa a ser um cadastro de produto SEPARADO (o mesmo
-- prato pode ter até 3 fichas técnicas diferentes — uma por modalidade — já que porção/
-- embalagem mudam por canal). Ele mesmo vai recadastrar os pratos existentes nas modalidades
-- certas aos poucos; esta migration não move/duplica nenhum Product existente.

-- AlterEnum
-- 3 valores novos de ProductCategory para as modalidades. Os 6 valores antigos de tipo-de-prato
-- (SUSHI, SASHIMI, TEMAKI, URAMAKI, HOT_ROLL, ENTRADA — ver prisma/migrations/
-- 20260922221943_ficha_tecnica_categorias_por_loja) continuam no enum intactos, porque produtos
-- já cadastrados com eles continuam existindo no banco; só deixam de ter uma aba/Subcategory
-- ativa que os mostre (ver DML abaixo). Mesmo padrão de IF NOT EXISTS já usado em
-- prisma/migrations/20260830210000_payment_method_novos_valores e em
-- 20260922221943_ficha_tecnica_categorias_por_loja, por segurança para o caso de a migration
-- ser reaplicada.
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'DELIVERY';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'LA_CARTE';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'RODIZIO';

-- ============================================================================
-- Dado (não só schema): mesmo racional de
-- prisma/migrations/20260922221943_ficha_tecnica_categorias_por_loja e
-- 20260923120000_ficha_tecnica_sobremesas_subcategoria — scripts/migrate-deploy.sh só roda
-- `prisma migrate deploy`, nunca `npm run db:seed`, então em produção (onde o seed já rodou
-- no passado) só atualizar prisma/seed.ts NÃO seria suficiente: as 6 subcategorias antigas
-- continuariam ativas, "sobremesas" continuaria compartilhada, e as 3 novas nunca seriam
-- criadas, porque ninguém roda o seed de novo. prisma/seed.ts já está corrigido pra banco novo
-- do zero (prisma.subcategory.upsert cobre tudo abaixo automaticamente) — o SQL a seguir é
-- ADICIONAL, só pra cobrir banco já populado.
-- ============================================================================

-- 1) Desativa (não exclui — mantém histórico e evita qualquer problema de FK com produtos já
-- cadastrados nessas categorias) as 6 subcategorias antigas de tipo-de-prato da Zarki Sushi.
-- Os produtos já cadastrados com essas categorias continuam no banco, intocados — só ficam sem
-- nenhuma aba que os mostre até o Matheus recadastrar/reclassificar manualmente (aceito por ele).
UPDATE "Subcategory"
SET "active" = false
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'ficha-tecnica')
  AND "key" IN ('entradas', 'sashimis', 'sushis', 'temakis', 'uramakis', 'hot-rolls');

-- 2) "Sobremesas" era compartilhada entre as duas lojas (empresaId NULL) — passa a ser
-- exclusiva da Nord Pizza, já que a Zarki Sushi agora só usa Delivery/À La Carte/Rodízio (a
-- pedido do Matheus). Resolve o id real da empresa pela key, mesmo padrão já usado em
-- 20260922221943_ficha_tecnica_categorias_por_loja.
UPDATE "Subcategory"
SET "empresaId" = (SELECT "id" FROM "Empresa" WHERE "key" = 'nord-pizza')
WHERE "key" = 'sobremesas'
  AND "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'ficha-tecnica');

-- 3) As 3 subcategorias novas de modalidade de venda da Zarki Sushi (mesmos key/name/icon/order
-- que em CATEGORIES → "ficha-tecnica" → subs em prisma/seed.ts). "order" contínuo a partir de 17,
-- logo depois de "sobremesas"=16 (a última subcategoria desta categoria antes desta migration;
-- ver 20260923120000_ficha_tecnica_sobremesas_subcategoria) — nenhuma subcategoria existente
-- precisa ser deslocada porque as novas entram no FIM da lista, mesmo raciocínio das migrations
-- anteriores desta mesma categoria. "color" não é passada por CATEGORIES pra nenhuma
-- subcategoria de ficha-tecnica, então usa o default do schema ('#2952E3'), igual as demais.
-- ON CONFLICT DO NOTHING: idempotente, nunca sobrescreve uma customização manual já feita na
-- tela de Permissões/menu, e não duplica se esta migration rodar num banco onde `db:seed` já
-- tiver criado essas mesmas linhas primeiro (banco novo do zero + seed).
INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "empresaId", "createdAt", "updatedAt")
SELECT 'sub-ficha-tecnica-delivery', c."id", 'delivery', 'Delivery', 'Bike', '#2952E3', 17, true, true, e."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c, "Empresa" e WHERE c."key" = 'ficha-tecnica' AND e."key" = 'zarki-sushi'
ON CONFLICT ("categoryId", "key") DO NOTHING;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "empresaId", "createdAt", "updatedAt")
SELECT 'sub-ficha-tecnica-la-carte', c."id", 'la-carte', 'À La Carte', 'UtensilsCrossed', '#2952E3', 18, true, true, e."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c, "Empresa" e WHERE c."key" = 'ficha-tecnica' AND e."key" = 'zarki-sushi'
ON CONFLICT ("categoryId", "key") DO NOTHING;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "empresaId", "createdAt", "updatedAt")
SELECT 'sub-ficha-tecnica-rodizio', c."id", 'rodizio', 'Rodízio', 'CookingPot', '#2952E3', 19, true, true, e."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c, "Empresa" e WHERE c."key" = 'ficha-tecnica' AND e."key" = 'zarki-sushi'
ON CONFLICT ("categoryId", "key") DO NOTHING;
