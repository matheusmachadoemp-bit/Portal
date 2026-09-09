-- Backfill de dado (sem alteração de schema) — parte da correção do achado 1/4 da auditoria de
-- segurança (Nelson): "producao" e "manutencao" entraram na constante MODULES
-- (src/lib/permissions.ts) nas migrations "manutencao_fase1" (2026-09-05) e "producao_fase1"
-- (2026-09-07), mas nenhuma das duas trouxe um backfill de ModulePermission — diferente do que a
-- migration seguinte, "permission_module_niveis_e_modulos_novos" (2026-09-08), fez para "reuniao" e
-- "loja-nord" (que também faltavam na constante, mas ganharam backfill explícito na mesma migration
-- que as adicionou). Ou seja: todo PermissionProfile criado antes de 2026-09-05/07 (na prática,
-- todos — não existe tela de criação de perfil customizado, os 8 perfis de PERMISSION_PROFILES são
-- criados uma única vez pelo seed) nunca ganhou uma linha de ModulePermission para "producao"/
-- "manutencao", a menos que `npm run db:seed` tenha rodado de novo manualmente depois dessas datas
-- (o deploy normal não recria essas linhas, só `scripts/migrate-deploy.sh`, que roda migrations, não
-- o seed).
--
-- Por que isso importa AGORA: até 2026-09-09, `hasModulePermission` (src/lib/authz.ts) tratava
-- "perfil existe mas sem linha para este módulo" como fail-open (`return true`, liberava a ação).
-- Corrigido nesta mesma leva de correções para negar por padrão (`return false`) — o que significa
-- que, sem este backfill, qualquer perfil sem linha para "producao"/"manutencao" passaria a ficar
-- SEM ACESSO NENHUM a esses dois módulos (ninguém veria nada, de uma hora para outra), em vez de
-- continuar com o nível que o próprio perfil já tem nos outros módulos. Este backfill preenche as
-- linhas que faltam ANTES dessa mudança valer, para ninguém perder acesso que já tinha de fato.
--
-- Flags aplicadas: mesmo mapeamento cargo -> nível de acesso já usado pela migration
-- "permission_module_niveis_e_modulos_novos" para "reuniao"/"loja-nord" (e pelo seed corrigido, via
-- ACCESS_LEVEL_TO_MODULE_FLAGS[defaultLevelForProfileKey(profile.key)] em
-- src/lib/permissions.ts) — canView sempre true; canCreate/canEdit true só para
-- administrador/gestor/gerente/supervisor (nível EDITAR); canDelete true só para administrador
-- (nível TOTAL). Conservador de propósito: nenhum perfil ganha permissão de excluir que não tinha
-- antes (o pedido explícito da correção é "não dar acesso de exclusão de graça").
--
-- ON CONFLICT DO NOTHING em ambos os INSERTs: seguro mesmo que o seed já tenha rodado de novo em
-- algum ambiente (não sobrescreve nenhuma customização manual feita na tela de Permissões depois
-- que a linha já existir) e seguro rodar mais de uma vez.
--
-- "reuniao" e "loja-nord" incluídos de novo aqui, também com ON CONFLICT DO NOTHING: só por
-- segurança/idempotência (nenhuma linha nova é esperada, já foram cobertos por
-- "permission_module_niveis_e_modulos_novos") — não custa nada garantir que os 4 módulos citados no
-- achado 4 da auditoria fiquem cobertos pela mesma migration, caso algum ambiente tenha pulado
-- aquela migration por qualquer motivo.
INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_' || mod."key",
  pp."id",
  mod."key",
  true,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
CROSS JOIN (VALUES ('producao'), ('manutencao'), ('reuniao'), ('loja-nord')) AS mod("key")
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;
