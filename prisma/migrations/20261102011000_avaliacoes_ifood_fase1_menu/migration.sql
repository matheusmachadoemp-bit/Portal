-- Avaliações — Fase 1: item de menu lateral ("Avaliações", com 2 subcategorias: "Respostas" e
-- "Configurações") + módulo de permissão "avaliacoes" (ver src/lib/permissions.ts, MODULES, e
-- src/app/api/avaliacoes/**). Só dado (INSERT), sem alteração de schema — mesmo padrão já usado
-- em prisma/migrations/20261026041000_reservas_etapa1_menu_permissao e
-- 20261031011000_nord_ai_fundacao_menu (o deploy automático nunca roda prisma/seed.ts, então
-- toda categoria/subcategoria/permissão nova precisa de uma migration de dado equivalente pra
-- chegar em produção).
--
-- Visibilidade por padrão (mesmo racional de "reservas", ver migration
-- 20261026041000_reservas_etapa1_menu_permissao: módulo sensível — aqui ainda mais, já que
-- configura um toggle que libera publicação automática de texto público em nome do negócio,
-- sem aprovação por avaliação individual): Administrador (bypassa ModulePermission, ganha uma
-- linha aqui mesmo assim, nível TOTAL, só para aparecer corretamente marcado na tela de
-- Permissões) e Gestor/Gerente (nível EDITAR: vê, executa, cria e edita; não exclui) ganham
-- acesso automático. Os demais 5 perfis (supervisor, lider, funcionario, marketing, financeiro)
-- nascem em NENHUM (todas as 5 flags false) — disponíveis para liberação manual na tela de
-- Permissões. `ON CONFLICT DO NOTHING`: idempotente, nunca sobrescreve uma customização manual
-- já feita.
--
-- "order" da categoria calculado como o próximo disponível (MAX + 1), mesmo racional já usado
-- nas migrations citadas acima — não depende de quais categorias/ordens já existem em produção
-- hoje.
INSERT INTO "Category" ("id", "key", "name", "icon", "color", "order", "active", "isSystem", "contentType", "createdAt", "updatedAt")
SELECT
  'cat-avaliacoes',
  'avaliacoes',
  'Avaliações',
  'Star',
  '#2952E3',
  COALESCE((SELECT MAX(c."order") FROM "Category" c), -1) + 1,
  true,
  true,
  'avaliacoes',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
ON CONFLICT ("key") DO NOTHING;

-- 2 subcategorias: "Respostas" (lista de avaliações com status/resposta gerada/publicada, com
-- ação de revisar manualmente as que precisarem — src/app/portal/avaliacoes/respostas/) e
-- "Configurações" (toggle de ativar/desativar resposta automática por loja, com aviso sobre a
-- palavra-chave de risco — src/app/portal/avaliacoes/configuracoes/). As duas já têm página
-- própria nesta fase (diferente de "Reservas" Etapa 1, que nasceu com a maioria em fallback
-- genérico) — módulo pequeno o suficiente para entregar as duas telas de uma vez.
INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT v."id", c."id", v."key", v."name", v."icon", '#2952E3', v."order", true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c
JOIN (
  VALUES
    ('sub-avaliacoes-respostas', 'respostas', 'Respostas', 'MessageSquareReply', 0),
    ('sub-avaliacoes-configuracoes', 'configuracoes', 'Configurações', 'Settings', 1)
) AS v("id", "key", "name", "icon", "order")
  ON true
WHERE c."key" = 'avaliacoes'
ON CONFLICT ("categoryId", "key") DO NOTHING;

-- Módulo de permissão "avaliacoes" (chave de categoria inteira, não composta — igual a todo
-- módulo do catálogo `MODULES` em src/lib/permissions.ts). Ver comentário no topo do arquivo
-- para o racional de quem ganha o quê por padrão.
INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canExecute", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_avaliacoes',
  pp."id",
  'avaliacoes',
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente') THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;
