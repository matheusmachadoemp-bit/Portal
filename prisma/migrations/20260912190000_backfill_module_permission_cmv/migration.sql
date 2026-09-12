-- Backfill de dado (sem alteração de schema) — achado do lote "Reforça canView nas páginas e
-- rotas de Vendas, Metas, CRM, Ficha Técnica, Estoque e CMV": a chave "cmv" está em MODULES
-- (src/lib/permissions.ts) e em CATEGORIES (prisma/seed.ts) desde 2026-09-02 (criação do
-- catálogo do módulo CMV), mas, diferente de "reuniao"/"loja-nord" (backfill em
-- 20260908130000_permission_module_niveis_e_modulos_novos) e "producao"/"manutencao" (backfill em
-- 20260909130000_backfill_module_permission_producao_manutencao), nenhuma migration jamais criou
-- as linhas de ModulePermission para "cmv". O seed sempre cria essa linha (loop
-- `for (const mod of MODULES)`, para todo PermissionProfile), mas só quando executado
-- manualmente (`npm run db:seed`) — o deploy automático (scripts/migrate-deploy.sh) só roda
-- `prisma migrate deploy`, nunca o seed. Ou seja: não há garantia de que nenhum
-- PermissionProfile em produção tenha uma linha para "cmv" hoje.
--
-- Por que isso importa agora: até esta leva de correções, o "canView" de CMV só escondia o
-- módulo do menu lateral — as páginas e rotas de CMV não checavam `hasModulePermission` de
-- verdade, então a ausência da linha nunca bloqueou ninguém na prática. Agora que
-- src/app/portal/cmv/**/page.tsx passam a checar `hasModulePermission(userId, "cmv", "canView")`
-- (perfil sem linha para o módulo = SEM ACESSO, desde a correção do fail-open em
-- hasModulePermission), qualquer perfil sem essa linha perderia acesso a CMV de uma hora para
-- outra, mesmo continuando com o mesmo cargo/nível que já tinha nos outros módulos. Este backfill
-- preenche a linha que falta ANTES dessa checagem valer, para ninguém perder acesso que já tinha
-- de fato.
--
-- Flags aplicadas: mesmo mapeamento cargo -> nível de acesso que o seed geraria hoje para
-- qualquer módulo (ACCESS_LEVEL_TO_MODULE_FLAGS[defaultLevelForProfileKey(profile.key)] em
-- src/lib/permissions.ts, mesmo critério já usado pelos dois backfills citados acima) — canView
-- sempre true; canExecute/canCreate/canEdit true só para administrador/gestor/gerente/supervisor
-- (nível EDITAR); canDelete true só para administrador (nível TOTAL). Conservador de propósito:
-- nenhum perfil ganha permissão de excluir que não tinha antes.
--
-- ON CONFLICT DO NOTHING: idempotente e seguro mesmo que o seed já tenha rodado manualmente em
-- algum ambiente depois de 2026-09-02, ou que algum admin já tenha customizado manualmente a
-- linha "cmv" de algum perfil pela tela de Permissões — este backfill nunca sobrescreve uma linha
-- já existente, só cria a que falta.
INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canExecute", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_cmv',
  pp."id",
  'cmv',
  true,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;
