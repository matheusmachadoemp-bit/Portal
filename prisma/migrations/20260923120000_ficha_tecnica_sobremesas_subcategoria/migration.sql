-- O valor SOBREMESA do enum "ProductCategory" (prisma/migrations/20260811150000_sale_transactions)
-- e a rota /portal/ficha-tecnica/sobremesas (FICHA_TECNICA_SUB_MAP em src/lib/ficha.ts) já
-- existiam, mas nunca existiu a linha correspondente em "Subcategory" — ou seja, mesmo com um
-- Product já cadastrado como SOBREMESA, a tela funciona (a query em [sub]/page.tsx já filtra por
-- category) só que sem nenhum link no menu lateral pra chegar lá. Mesmo racional de
-- prisma/migrations/20260920120000_escala_folgas_menu_subcategoria e
-- prisma/migrations/20260922221943_ficha_tecnica_categorias_por_loja: scripts/migrate-deploy.sh só
-- roda `prisma migrate deploy`, nunca `npm run db:seed` — então em qualquer banco onde o seed já
-- rodou uma vez no passado (produção incluída), só atualizar prisma/seed.ts NÃO é suficiente: a
-- linha nunca seria criada porque ninguém roda o seed de novo. prisma/seed.ts já está corrigido
-- pra banco novo do zero (prisma.subcategory.upsert cobre tudo abaixo automaticamente) — o SQL a
-- seguir é ADICIONAL, só pra cobrir banco já populado.
--
-- Compartilhada entre as duas lojas (empresaId NULL, mesmo padrão de Combos/Bebidas/Drinks): não
-- há nenhum Product cadastrado com category SOBREMESA no seed nem qualquer indício de que a
-- categoria seja exclusiva de uma loja — "sobremesa" é um conceito de cardápio genérico o
-- bastante pra cada loja ter as suas (ex.: petit gateau na Nord Pizza, mochi/cheesecake de matchá
-- na Zarki) sem precisar de categorias de produto separadas, mesmo raciocínio já usado pra
-- Combos/Bebidas/Drinks. FICHA_TECNICA_SUB_MAP (src/lib/ficha.ts) já trata "sobremesas" sem
-- `empresaKey` desde que a rota foi criada, ou seja, o código já esperava esse comportamento.
--
-- Posição: order 16, logo depois da última subcategoria existente da Ficha Técnica ("hot-rolls" =
-- 15) — mesmo raciocínio de 20260922221943_ficha_tecnica_categorias_por_loja (entra no FIM da
-- lista, nenhuma subcategoria antiga precisa ser deslocada, diferente do precedente de
-- escala-folgas, que abria espaço no MEIO da lista).
--
-- "color" não é passada por CATEGORIES pra nenhuma subcategoria de ficha-tecnica, então usa o
-- default do schema ('#2952E3'), igual as demais. ON CONFLICT DO NOTHING: idempotente, nunca
-- sobrescreve uma customização manual já feita na tela de Permissões/menu, e não duplica se esta
-- migration rodar num banco onde `db:seed` já tiver criado a linha primeiro (banco novo do zero +
-- seed).
INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "empresaId", "createdAt", "updatedAt")
SELECT 'sub-ficha-tecnica-sobremesas', "id", 'sobremesas', 'Sobremesas', 'CakeSlice', '#2952E3', 16, true, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" WHERE "key" = 'ficha-tecnica'
ON CONFLICT ("categoryId", "key") DO NOTHING;
