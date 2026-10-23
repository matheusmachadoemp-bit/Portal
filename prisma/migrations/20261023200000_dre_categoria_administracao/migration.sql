-- ============================================================================================================
-- Nova categoria financeira na DRE, a pedido do Matheus: "Administração", dentro do grupo já existente
-- "Despesas Administrativas" (dreKey "despesas-administrativas"), ao lado de "Outras Despesas
-- Administrativas". Decisão (sem ambiguidade suficiente para parar e perguntar, documentada aqui): item
-- genérico dentro do grupo que já se chama "Despesas Administrativas", não um grupo novo.
--
-- Migration PURA DML (sem mudança de schema): produção já está seedada, então a mudança feita em
-- src/lib/dre-structure.ts (que o seed.ts usa via allDreCategories()/upsert por name) não chega sozinha a um
-- banco já existente. FinancialCategory.name é @unique, então o INSERT usa ON CONFLICT (name) DO NOTHING
-- para ficar idempotente (seguro rodar de novo, ou rodar depois de um seed que já tenha criado a linha).
--
-- type = 'DESPESA' porque o grupo "despesas-administrativas" não está no dreCategoryTypeMap do seed.ts,
-- então cai no default "DESPESA" (confirmado em prisma/seed.ts).
-- ============================================================================================================

INSERT INTO "FinancialCategory" ("id", "name", "type", "dreKey", "active", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'Administração',
  'DESPESA',
  'administracao',
  true,
  now(),
  now()
)
ON CONFLICT ("name") DO NOTHING;
