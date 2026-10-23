-- Central de Bugs e Melhorias (Fase 3 — Fases 1/2 já publicadas: backend em
-- src/app/api/feedback/** — PR #511 — e ícone global no topbar — PR #512). Esta migração só
-- adiciona o item de menu lateral: "Administrativo" > "Bugs e Melhorias", apontando pro painel
-- administrativo que o Caio está construindo em paralelo em
-- src/app/portal/administrativo/bugs-melhorias/page.tsx. A tela pública de envio (modal da Fase
-- 2) continua acessível só pelo ícone do topbar, sem item de menu próprio.
--
-- Só dado (INSERT), sem alteração de schema: a tabela "Subcategory" já existe desde
-- prisma/migrations/20260420000000_init (ou equivalente) e nenhuma coluna/enum novo é necessário
-- para isto — mesmo padrão já usado em
-- prisma/migrations/20260930130000_satisfacao_cliente_roleta_menu_subcategoria e
-- prisma/migrations/20260925120000_gasto_por_insumo_estoque_menu.
--
-- De propósito SEM nenhuma linha de "ModulePermission" pra chave composta
-- "administrativo:bugs-melhorias": mesma decisão já tomada pro painel admin da API na Fase 1
-- (ver prisma/migrations/20261021184823_central_bugs_melhorias e as rotas em
-- src/app/api/feedback/dashboard/route.ts e src/app/api/feedback/[id]/route.ts, que checam
-- `session.user.role !== "ADMINISTRADOR"` de forma literal, não por ModulePermission) — ninguém
-- deve conseguir liberar o PAINEL ADMINISTRATIVO (a API por trás dele) pra outro cargo pela tela
-- de Permissões. A chave "bugs-melhorias" (usada por `hasModulePermission(...,
-- "bugs-melhorias", ...)` nessas rotas) também não entra no catálogo `MODULES` de
-- src/lib/permissions.ts, igual à decisão do Otavio.
--
-- ATENÇÃO (achado, não corrigido nesta migração): como "administrativo" já é um módulo comum do
-- catálogo `MODULES` — visível por padrão pra praticamente todos os perfis (inclusive
-- Gerente/Supervisor/Gestor/Funcionário, que herdam `canView: true` do nível
-- EDITAR/VISUALIZAR calculado em `defaultLevelForRole`, ver ACCESS_LEVEL_TO_MODULE_FLAGS em
-- src/lib/permissions.ts) — o item de MENU "Bugs e Melhorias" herda essa mesma visibilidade de
-- categoria (buildVisibilityResolver cai pra `canView` da categoria inteira quando não existe
-- linha própria pra "administrativo:bugs-melhorias", mesmo fallback documentado no comentário da
-- função). Validado ao vivo (login real como Gerente, ver relatório da tarefa): o LINK aparece
-- no menu pra Gerente também, não só pra Administrador — diferente do pedido original. A API por
-- trás da tela (painel administrativo) continua protegida (nega com 403 pra quem não for
-- ADMINISTRADOR, checagem literal de role, independente do menu), então não há brecha de dado —
-- só uma inconsistência de UX (link visível que nega acesso ao clicar). Resolver isso de verdade
-- exigiria OU uma linha de ModulePermission "administrativo:bugs-melhorias" com canView=false
-- pros perfis não-administrador (o que o pedido original pediu explicitamente para NÃO fazer), OU
-- uma decisão nova do Matheus sobre como esconder o link — fica para o líder decidir no
-- relatório desta tarefa, não decidido unilateralmente aqui.
--
-- `order` calculado como o próximo disponível dentro de "administrativo" (em vez de um literal
-- fixo), mesmo racional já usado em 20260930130000_satisfacao_cliente_roleta_menu_subcategoria:
-- fica depois de "Senhas", "Cursos", "Cartilhas", "Logo" e "Arquivos" (as 5 subcategorias já
-- existentes hoje), sejam quais forem os valores atuais de "order" em produção.
--
-- ON CONFLICT DO NOTHING: idempotente e nunca sobrescreve uma customização manual já feita na
-- tela de Permissões/menu (mesma regra dos precedentes citados acima).
INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT
  'sub-administrativo-bugs-melhorias',
  c."id",
  'bugs-melhorias',
  'Bugs e Melhorias',
  'Bug',
  '#2952E3',
  COALESCE((SELECT MAX(s."order") FROM "Subcategory" s WHERE s."categoryId" = c."id"), -1) + 1,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Category" c
WHERE c."key" = 'administrativo'
ON CONFLICT ("categoryId", "key") DO NOTHING;
