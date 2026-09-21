-- A subcategoria "Escala de Folgas" (menu lateral, dentro de RH) já existe em CATEGORIES
-- (prisma/seed.ts, dentro de "rh".subs) desde a Fase 1 da feature — ver
-- prisma/migrations/20260920064845_escala_folgas_fase1_schema para o schema de
-- DayOffType/DayOffEntry/SchedulePeriod/StoreClosedWeekday/SectorCoverageConfig — mas nenhuma
-- migration chegou a inserir essa linha de verdade na tabela "Subcategory". O deploy automático
-- (scripts/migrate-deploy.sh) só roda `prisma migrate deploy`, nunca `npm run db:seed`, e
-- `sidebar.tsx` só renderiza o que já existe na tabela — sem esta migration o item "Escala de
-- Folgas" nunca aparece em nenhum banco já existente (produção incluída), mesmo com o schema da
-- Fase 1 já aplicado. Mesmo racional de prisma/migrations/20260905060000_satisfaction_module
-- (subcategoria "Pesquisa de Satisfação", também dentro de RH) e
-- 20260915140000_vendas_visao_geral_subcategoria.
--
-- Não mexe em sidebar.tsx nem em src/lib/permissions.ts: sem uma chave específica
-- "rh:escala-folgas" em ModulePermission, `buildVisibilityResolver` já cai automaticamente para a
-- permissão do módulo "rh" inteiro (mesmo fallback que "colaboradores"/"financeiro"/etc. já usam
-- desde sempre) — o item já aparece sozinho pra quem tiver "rh" liberado assim que esta linha
-- existir, sem precisar de uma linha nova em ModulePermission.
--
-- Posição: entre "Férias" (order 4) e "Uniformes" (hoje order 5) — mesma ordem já usada em
-- CATEGORIES (prisma/seed.ts: colaboradores, financeiro, ponto-eletronico, ocorrencias, ferias,
-- escala-folgas, uniformes, documentos, pesquisa-satisfacao, dashboard). Abre espaço somando 1 às
-- subcategorias de RH que hoje estão em "uniformes" (order 5) e depois (documentos=6,
-- pesquisa-satisfacao=7, dashboard=8) antes de inserir a nova em 5.
--
-- ON CONFLICT DO NOTHING: idempotente e nunca sobrescreve uma customização manual já feita na
-- tela de Permissões/menu (mesma regra dos dois precedentes citados acima).

UPDATE "Subcategory"
SET "order" = "order" + 1
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'rh')
  AND "order" >= 5;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT 'sub-rh-escala-folgas', "id", 'escala-folgas', 'Escala de Folgas', 'CalendarDays', '#2952E3', 5, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" WHERE "key" = 'rh'
ON CONFLICT ("categoryId", "key") DO NOTHING;
