-- A tela da Roleta de Prêmios (admin de prêmios em /satisfacao-cliente/roleta, resgate em
-- /satisfacao-cliente/roleta/resgatar) já está publicada em produção desde a Fase 6/7 do módulo
-- "Satisfação do Cliente" (ver src/app/portal/satisfacao-cliente/roleta/**, rotas de API em
-- src/app/api/satisfacao-cliente/roleta/** e o backfill de permissão
-- prisma/migrations/20260930120000_satisfacao_cliente_roleta_resgate_permissao), mas nunca
-- chegou a ganhar uma linha de "Subcategory" — sem essa linha o item nunca aparece em nenhum
-- menu lateral (getMenuCategories, src/lib/menu-categories.ts, só lê o que já existe na
-- tabela; o deploy automático, scripts/migrate-deploy.sh, só roda `prisma migrate deploy`,
-- nunca `prisma/seed.ts`). Ver comentário completo (racional de nome/ícone/posição/permissão)
-- em prisma/seed.ts, dentro de CATEGORIES, junto de `{ key: "roleta", ... }` no bloco
-- "satisfacao-cliente".
--
-- Só dado (INSERT), sem alteração de schema: a tabela "Subcategory" já existe desde
-- prisma/migrations/20260420000000_init (ou equivalente) e nenhuma coluna/enum novo é
-- necessário para isto.
--
-- Chave usada no menu ("roleta") é a MESMA já usada pela API de permissão desde a Fase 6/7
-- (`hasModulePermission(session.user.id, "satisfacao-cliente", "canView"/"canExecute"/etc.,
-- "roleta")`, ver src/app/api/satisfacao-cliente/roleta/**/route.ts e
-- src/app/portal/satisfacao-cliente/roleta/page.tsx) — a chave composta que
-- `buildVisibilityResolver` usa pra filtrar o menu ("satisfacao-cliente:roleta", montada em
-- src/app/portal/layout.tsx como `${categoria.key}:${subcategoria.key}`) já bate exatamente com
-- a chave de ModulePermission que o backfill da migration anterior
-- (20260930120000_satisfacao_cliente_roleta_resgate_permissao) já gravou pra funcionario/lider
-- — nenhuma linha nova de ModulePermission precisa aqui, só esta Subcategory pra o item passar
-- a aparecer. Os demais perfis (administrador/gestor/gerente/supervisor) já enxergam o item
-- porque `buildVisibilityResolver` cai de volta pro `canView` da chave do módulo inteiro
-- "satisfacao-cliente" quando não existe uma linha própria de "satisfacao-cliente:roleta" pra
-- eles (mesmo fallback documentado nas migrations de "escala-folgas"/"fechamento-dia").
--
-- Rota física é /portal/satisfacao-cliente/roleta (src/app/portal/satisfacao-cliente/roleta/
-- page.tsx), então o link montado como `/portal/${categoria.key}/${subcategoria.key}` bate
-- certinho sem precisar de nenhuma página de redirecionamento (diferente do caso
-- visao-geral/avaliacoes em prisma/migrations/20260924210000_satisfacao_cliente_crm_menu). A
-- tela de resgate (/roleta/resgatar) não ganha item de menu próprio — continua acessada a
-- partir da tela de admin, não pelo menu lateral, do jeito que já funciona hoje.
--
-- `order` calculado como o próximo disponível dentro de "satisfacao-cliente" (em vez de um
-- literal fixo), mesmo racional já usado em 20260924210000_satisfacao_cliente_crm_menu: fica
-- depois de "Perguntas" e "QR Codes / Mesas" (as 2 únicas subcategorias já existentes nesta
-- categoria hoje), sejam quais forem os valores atuais de "order" em produção.
--
-- ON CONFLICT DO NOTHING: idempotente e nunca sobrescreve uma customização manual já feita na
-- tela de Permissões/menu (mesma regra dos precedentes citados acima).
INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT
  'sub-satisfacao-cliente-roleta',
  c."id",
  'roleta',
  'Roleta de Prêmios',
  'Gift',
  '#2952E3',
  COALESCE((SELECT MAX(s."order") FROM "Subcategory" s WHERE s."categoryId" = c."id"), -1) + 1,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Category" c
WHERE c."key" = 'satisfacao-cliente'
ON CONFLICT ("categoryId", "key") DO NOTHING;
