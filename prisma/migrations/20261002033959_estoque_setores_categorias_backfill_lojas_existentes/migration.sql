-- Bug: dropdown de "Setor" em Estoque > Contagem aparecia 100% vazio (sem nenhuma opção) pra
-- lojas que já existiam antes de 2026-10-01 — não por falta de cadastro do usuário, mas porque
-- a tabela "StockSector" nunca recebeu nenhuma linha pra essas lojas em produção. Raiz do
-- problema, encontrada lendo as duas migrations do dia 2026-10-01:
--
-- 1) 20261001024437_estoque_setores_e_agenda_contagem criou a tabela "StockSector" totalmente
--    vazia (só CREATE TABLE, nenhum INSERT) — antes dela, os 10 setores (Sushibar, Cozinha
--    quente, Pizzaria, ...) eram um array hardcoded em código (`SECTORS`, já removido de
--    src/lib/estoque.ts), sempre "aparecendo" sem nenhum cadastro em banco. A migration
--    presumiu que "prisma/seed.ts" (que já ganhou o loop de STOCK_SECTORS no mesmo dia) ia
--    popular a tabela — o que só é verdade para quem RODA `npm run db:seed` depois de migrar
--    (fluxo de banco novo, dev/staging).
-- 2) 20261001120000_estoque_setores_categorias_por_loja virou StockSector/StockCategory em
--    cadastro por loja, duplicando (via "INSERT ... SELECT ... CROSS JOIN Empresa") o que já
--    existia em cada tabela antes da migration. Para StockSector, que a migration anterior
--    (1) tinha deixado com ZERO linhas, "duplicar o que já existe" duplicou zero — ou seja,
--    zero linhas por loja, pra qualquer loja que já existia antes de 2026-10-01.
--
-- Em produção, só "prisma migrate deploy" roda automaticamente no build (ver
-- scripts/migrate-deploy.sh) — "npm run db:seed" só é executado manualmente, uma vez, no
-- bootstrap inicial (criação do primeiro usuário/empresa; não existe outro jeito de criar uma
-- Empresa no app) e nunca mais depois disso. Como a tabela "StockSector" e o trecho de seed que
-- a popula só passaram a existir em 2026-10-01 (bem depois do bootstrap inicial de produção já
-- ter acontecido), nenhuma execução de seed jamais rodou com esse trecho presente contra o
-- banco de produção — por isso a tabela ficou permanentemente vazia lá, mesmo com lojas reais
-- já cadastradas.
--
-- Esta migration corrige o dado agora (não só o schema): insere os mesmos 10 setores padrão
-- (mesmos nomes/ordem de prisma/seed.ts, pra não divergir do que uma base nova recebe) para
-- toda Empresa que hoje tem ZERO linhas em "StockSector" — nunca para quem já tem pelo menos 1
-- (uma base dev/staging que já rodou o seed, ou uma loja em que o usuário já cadastrou algum
-- setor manualmente tentando contornar o bug, continua exatamente como está, sem duplicar
-- nada). Idempotente: rodar de novo não insere nada a mais, porque depois da primeira execução
-- toda Empresa já tem pelo menos 1 linha.
INSERT INTO "StockSector" ("id", "empresaId", "name", "order", "active", "createdAt")
SELECT gen_random_uuid()::text, e."id", v."name", v."ord", true, now()
FROM "Empresa" e
CROSS JOIN (VALUES
  ('Sushibar', 0),
  ('Cozinha quente', 1),
  ('Pizzaria', 2),
  ('Chapa', 3),
  ('Produção', 4),
  ('Câmara fria', 5),
  ('Freezer', 6),
  ('Estoque seco', 7),
  ('Bar e bebidas', 8),
  ('Delivery e embalagens', 9)
) AS v("name", "ord")
WHERE NOT EXISTS (SELECT 1 FROM "StockSector" s WHERE s."empresaId" = e."id");

-- "StockCategory" não tem o mesmo histórico (é tabela desde 20260812120000_estoque_module_completo,
-- bem antes do bootstrap inicial de produção, então o seed original já deve ter populado as
-- categorias reais de cada loja antes de 2026-10-01) — mas, por segurança e pelo mesmo motivo
-- (nenhuma garantia de que TODA loja tenha passado por um seed com este catálogo, ex.: uma loja
-- cadastrada depois do bootstrap inicial sem seed novo), aplica a mesma rede de segurança: só
-- preenche o catálogo padrão (mesmos valores de prisma/seed.ts) para quem hoje tem ZERO
-- categorias — nunca para quem já tem pelo menos 1.
INSERT INTO "StockCategory" ("id", "empresaId", "key", "name", "color", "icon", "setor", "order", "metaPerdaPercent", "periodicidadeContagem", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."id", v."key", v."name", v."color", v."icon", v."setor", v."ord", v."meta", v."periodicidade", true, now(), now()
FROM "Empresa" e
CROSS JOIN (VALUES
  ('carnes', 'Carnes', '#ef4444', 'Beef', 'Câmara fria', 0, 2, 'SEMANAL'),
  ('pescados', 'Pescados', '#0ea5e9', 'Fish', 'Sushibar', 1, 3, 'SEMANAL'),
  ('frios', 'Frios', '#f97316', 'Sandwich', 'Câmara fria', 2, 2, 'SEMANAL'),
  ('laticinios', 'Laticínios', '#eab308', 'Milk', 'Câmara fria', 3, 2, 'SEMANAL'),
  ('hortifruti', 'Hortifruti', '#22c55e', 'Carrot', 'Câmara fria', 4, 4, 'SEMANAL'),
  ('congelados', 'Congelados', '#38bdf8', 'Snowflake', 'Freezer', 5, 1.5, 'SEMANAL'),
  ('massas-graos', 'Massas e Grãos', '#f59e0b', 'Wheat', 'Estoque seco', 6, 1, 'MENSAL'),
  ('molhos-temperos', 'Molhos e Temperos', '#dc2626', 'Soup', 'Estoque seco', 7, 1.5, 'MENSAL'),
  ('orientais', 'Insumos Orientais', '#a855f7', 'UtensilsCrossed', 'Sushibar', 8, 2, 'SEMANAL'),
  ('bebidas', 'Bebidas', '#2952E3', 'CupSoda', 'Bar e bebidas', 9, 1, 'MENSAL'),
  ('embalagens', 'Embalagens', '#64748b', 'Package', 'Delivery e embalagens', 10, 1, 'MENSAL'),
  ('limpeza', 'Produtos de Limpeza', '#06b6d4', 'SprayCan', 'Estoque seco', 11, 1, 'MENSAL')
) AS v("key", "name", "color", "icon", "setor", "ord", "meta", "periodicidade")
WHERE NOT EXISTS (SELECT 1 FROM "StockCategory" c WHERE c."empresaId" = e."id");
