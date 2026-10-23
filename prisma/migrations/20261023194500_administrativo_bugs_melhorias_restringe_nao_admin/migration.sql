-- Complemento da migration anterior (20261023190000_administrativo_bugs_melhorias_menu):
-- restringe de verdade a visibilidade do link "Administrativo > Bugs e Melhorias" no menu
-- lateral a SÓ o Role ADMINISTRADOR — mesmo critério literal já usado pela API do painel
-- (`session.user.role !== "ADMINISTRADOR"`, sem nenhuma exceção pra Gestor, ver
-- src/app/api/feedback/dashboard/route.ts e src/app/api/feedback/[id]/route.ts). Decisão
-- confirmada com o Matheus: "Proprietário" aqui é só o Role ADMINISTRADOR, sem papel novo e
-- sem estender pro perfil "gestor".
--
-- Achado da migration anterior (documentado lá e no relatório da tarefa, testado ao vivo): sem
-- esta migration, o link herdava a visibilidade da categoria "administrativo" inteira — que já é
-- `canView: true` por padrão pra praticamente todo perfil (Gerente/Supervisor/Gestor/
-- Funcionário/Líder/Marketing/Financeiro incluídos, via `defaultLevelForRole`/
-- `ACCESS_LEVEL_TO_MODULE_FLAGS`, src/lib/permissions.ts) — então "Bugs e Melhorias" aparecia
-- pra todo mundo, não só pro Administrador.
--
-- Mecanismo: mesmo padrão que `ensureDefaultSubcategoryPermissions` (src/lib/authz.ts) já usa
-- quando uma subcategoria nasce pela TELA de editar menu (rotas `/api/menu/subcategories` e
-- `/api/menu/reorder`) — uma linha de `ModulePermission` com CHAVE COMPOSTA
-- ("administrativo:bugs-melhorias") encerra a herança da categoria inteira em
-- `buildVisibilityResolver` (@/lib/permissions) e em `hasModulePermission` (@/lib/authz), igual
-- documentado no comentário de `ensureDefaultSubcategoryPermissions`. Diferente daquela função
-- (que dá o nível padrão do cargo pra Administrador E Gestor), aqui só o perfil "administrador"
-- fica de fora do INSERT abaixo — ele não precisa de linha nenhuma, já que
-- `buildVisibilityResolver`/`hasModulePermission` retornam acesso total pra `role ===
-- "ADMINISTRADOR"` ANTES de sequer olhar pra `ModulePermission` (nem passa pela lista de
-- perfil). Os outros 7 perfis do catálogo `PERMISSION_PROFILES` (gestor, supervisor, gerente,
-- lider, funcionario, marketing, financeiro) recebem `canView = false` (e as outras 4 flags
-- também false, nível "NENHUM" — mesmo valor de `ACCESS_LEVEL_TO_MODULE_FLAGS.NENHUM`): a chave
-- composta não aparece na tela de Permissões (que só configura módulos inteiros do catálogo
-- `MODULES`, nunca uma chave composta "categoria:subcategoria"), então ninguém consegue
-- liberar isso de volta por lá — só por um override manual de usuário específico (tela de
-- Usuários, `UserPermission`), se algum dia for decidido caso a caso.
--
-- `id` com sufixo fixo (mesmo padrão de 20260930120000_satisfacao_cliente_roleta_resgate_permissao)
-- em vez de um valor gerado, pra idempotência/legibilidade. ON CONFLICT DO NOTHING: nunca
-- sobrescreve uma customização manual já feita (ex.: se algum admin já tivesse criado à mão uma
-- linha "administrativo:bugs-melhorias" pra algum perfil antes desta migration rodar).
INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canExecute", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_administrativo-bugs-melhorias',
  pp."id",
  'administrativo:bugs-melhorias',
  false,
  false,
  false,
  false,
  false
FROM "PermissionProfile" pp
WHERE pp."key" IN ('gestor', 'supervisor', 'gerente', 'lider', 'funcionario', 'marketing', 'financeiro')
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;
