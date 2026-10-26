-- Reservas — Etapa 1: item de menu lateral ("Reservas", com 8 subcategorias) + módulo de
-- permissão "reservas" (ver src/lib/permissions.ts, MODULES, e src/app/api/reservas/**). Só
-- dado (INSERT), sem alteração de schema — mesmo padrão já usado em
-- prisma/migrations/20261023190000_administrativo_bugs_melhorias_menu e
-- 20260930130000_satisfacao_cliente_roleta_menu_subcategoria (o deploy automático nunca roda
-- prisma/seed.ts, então toda categoria/subcategoria/permissão nova precisa de uma migration de
-- dado equivalente pra chegar em produção).
--
-- Visibilidade por padrão (decisão do Matheus, ver prompt da tarefa "reservas-etapa1"):
-- Administrador (bypassa ModulePermission, não precisa de linha — mas ganha uma aqui mesmo
-- assim, nível TOTAL, só pra aparecer corretamente marcado na tela de Permissões, igual ao
-- padrão do loop genérico de `prisma/seed.ts` pros demais módulos) e Gestor/Gerente (nível
-- EDITAR: vê, executa, cria e edita; não exclui) ganham acesso automático. Os demais 5 perfis
-- (supervisor, lider, funcionario, marketing, financeiro) nascem em NENHUM (todas as 5 flags
-- false) — diferente do padrão genérico de `prisma/seed.ts` (que daria VISUALIZAR, visível no
-- menu, pra QUALQUER perfil sem linha própria) — ficam disponíveis pra liberação manual na tela
-- de Permissões, igual pedido original. `ON CONFLICT DO NOTHING`: idempotente, nunca sobrescreve
-- uma customização manual já feita.
--
-- `order` da categoria calculado como o próximo disponível (MAX + 1) em vez de um literal fixo,
-- mesmo racional já usado nas migrations citadas acima — não depende de quais categorias/ordens
-- já existem em produção hoje.
INSERT INTO "Category" ("id", "key", "name", "icon", "color", "order", "active", "isSystem", "contentType", "createdAt", "updatedAt")
SELECT
  'cat-reservas',
  'reservas',
  'Reservas',
  'CalendarCheck',
  '#2952E3',
  COALESCE((SELECT MAX(c."order") FROM "Category" c), -1) + 1,
  true,
  true,
  'reservas',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
ON CONFLICT ("key") DO NOTHING;

-- 8 subcategorias, na ordem pedida (Visão Geral, Reservas, Calendário, Mesas e Ambientes, Fila de
-- Espera, Clientes, Relatórios, Configurações). Só "Configurações" tem página própria nesta
-- etapa (src/app/portal/reservas/configuracoes/page.tsx) — as outras 7 caem no conteúdo
-- genérico de fallback (branch "categoria-generica", já publicada) até ganharem tela própria
-- nas próximas etapas.
INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT v."id", c."id", v."key", v."name", v."icon", '#2952E3', v."order", true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" c
JOIN (
  VALUES
    ('sub-reservas-visao-geral', 'visao-geral', 'Visão Geral', 'LayoutDashboard', 0),
    ('sub-reservas-reservas', 'reservas', 'Reservas', 'ClipboardList', 1),
    ('sub-reservas-calendario', 'calendario', 'Calendário', 'CalendarDays', 2),
    ('sub-reservas-mesas-ambientes', 'mesas-ambientes', 'Mesas e Ambientes', 'Armchair', 3),
    ('sub-reservas-fila-espera', 'fila-espera', 'Fila de Espera', 'Hourglass', 4),
    ('sub-reservas-clientes', 'clientes', 'Clientes', 'Users', 5),
    ('sub-reservas-relatorios', 'relatorios', 'Relatórios', 'BarChart3', 6),
    ('sub-reservas-configuracoes', 'configuracoes', 'Configurações', 'Settings', 7)
) AS v("id", "key", "name", "icon", "order")
  ON true
WHERE c."key" = 'reservas'
ON CONFLICT ("categoryId", "key") DO NOTHING;

-- Módulo de permissão "reservas" (chave de categoria inteira, não composta — igual a todo
-- módulo do catálogo `MODULES` em src/lib/permissions.ts). Ver comentário no topo do arquivo
-- para o racional de quem ganha o quê por padrão.
INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canExecute", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_reservas',
  pp."id",
  'reservas',
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente') THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;
