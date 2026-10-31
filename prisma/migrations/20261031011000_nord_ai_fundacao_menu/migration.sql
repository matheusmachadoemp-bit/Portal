-- Nord AI — Fase 1, Etapa 1: item de menu lateral ("Nord AI" > "Painel"). Só dado (INSERT), sem
-- alteração de schema — mesmo padrão já usado em
-- prisma/migrations/20261023190000_administrativo_bugs_melhorias_menu e
-- 20261026041000_reservas_etapa1_menu_permissao (o deploy automático nunca roda
-- prisma/seed.ts, então toda categoria/subcategoria nova precisa de uma migration de dado
-- equivalente pra chegar em produção).
--
-- Cor "#1464F4" (variável CSS --nord-blue, ver src/app/globals.css) — mesma cor de destaque já
-- usada pelo botão fixo da Central de Bugs e Melhorias no Topbar (src/components/topbar/
-- topbar.tsx, classes `text-nord-blue-light`/`hover:bg-nord-blue/15`) e o próprio default do
-- color picker de categoria/subcategoria nova na tela (src/components/sidebar/sidebar.tsx,
-- `useState(category?.color ?? "#1464F4")`) — não o default genérico "#2952E3" do schema,
-- escolhido de propósito pra destacar visualmente este item como "diferente" dos módulos
-- operacionais comuns, igual pedido na tarefa.
--
-- `order` calculado como o próximo disponível (MAX + 1) em vez de um literal fixo, mesmo
-- racional das migrations citadas acima — não depende de quais categorias/ordens já existem em
-- produção hoje.
--
-- Categoria SEM subcategoria própria nunca navega sozinha — aqui ela TEM uma subcategoria
-- ("Painel"), então clicar na categoria só expande/recolhe a lista (comportamento padrão do
-- sidebar pra qualquer categoria com >= 1 subcategoria, ver comentário de `Category.linked` em
-- prisma/schema.prisma); quem navega é sempre a subcategoria "Painel" (/portal/nord-ai/painel).
-- Esta etapa (fundação: schema/menu/permissão/API, sem UI) não cria nenhuma pasta de rota
-- física em src/app/portal/nord-ai/ — a navegação cai no fallback genérico
-- (`GenericModulePage`, @/components/generic-module/generic-module-page.tsx, pelo catch-all
-- src/app/portal/[category]/[sub]/page.tsx), mesmo comportamento transitório já usado pelas
-- subcategorias de "Reservas" sem tela própria ainda (ver prisma/seed.ts). Esse fallback já
-- nega acesso por conta própria a quem não tem `canView` (`loadGenericContent`,
-- @/lib/generic-content.ts, via `hasModulePermission`) — como não existe NENHUMA linha de
-- `ModulePermission` para "nord-ai"/"nord-ai:painel" (ver bloco abaixo), isso já restringe o
-- fallback a só Administrador, mesmo sem nenhuma tela de verdade ainda. Construir a tela de
-- chat real (Caio) substitui esse fallback só adicionando a pasta física
-- src/app/portal/nord-ai/painel/page.tsx — sem precisar de nenhuma migration nova.
--
-- DE PROPÓSITO sem nenhuma linha de "ModulePermission" para a chave "nord-ai" (nem para a chave
-- composta "nord-ai:painel"), e a chave "nord-ai" propositalmente NÃO entra no catálogo
-- `MODULES` de src/lib/permissions.ts: mesma decisão já tomada para "bugs-melhorias" (ver
-- prisma/migrations/20261023190000_administrativo_bugs_melhorias_menu) — ninguém deve poder
-- liberar o módulo pra outro cargo pela tela de Permissões (que só configura módulos do
-- catálogo `MODULES`), e um módulo ausente do catálogo nunca ganha uma linha de
-- `ModulePermission` para nenhum perfil (ver comentário de `MODULES`, @/lib/permissions, e do
-- loop de seed que itera sobre ele) — então, diferente de "bugs-melhorias" (que precisou de uma
-- 2ª migration restringindo, porque a categoria "administrativo" ONDE a subcategoria mora já é
-- visível por padrão pra quase todo perfil), aqui a ausência total de linha já é suficiente:
-- `buildVisibilityResolver`/`hasModulePermission` negam por padrão pra QUALQUER perfil sem
-- linha explícita (regra 6 do comentário de `hasModulePermission`, @/lib/authz) — só
-- `role === "ADMINISTRADOR"` passa, sempre, independente de catálogo/linha (regra 1 das duas
-- funções). Resultado: o item de menu só aparece pra Administrador, sem precisar de nenhuma
-- migration adicional de restrição. O pedido original prevê liberar Gerente/outros perfis no
-- futuro — quando isso acontecer, basta adicionar "nord-ai" a `MODULES` e rodar uma migration de
-- dado dando as linhas de `ModulePermission` certas (fica para uma tarefa de ajuste fino
-- separada, decisão de escopo desta etapa).
--
-- As rotas de API (src/app/api/nord-ai/**) também checam `session.user.role ===
-- "ADMINISTRADOR"` de forma literal, independente do menu/fallback acima — mesmo padrão de
-- src/app/portal/administrativo/bugs-melhorias/page.tsx.
INSERT INTO "Category" ("id", "key", "name", "icon", "color", "order", "active", "isSystem", "contentType", "createdAt", "updatedAt")
SELECT
  'cat-nord-ai',
  'nord-ai',
  'Nord AI',
  'Sparkles',
  '#1464F4',
  COALESCE((SELECT MAX(c."order") FROM "Category" c), -1) + 1,
  true,
  true,
  'nord-ai',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT
  'sub-nord-ai-painel',
  c."id",
  'painel',
  'Painel',
  'Bot',
  '#1464F4',
  0,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Category" c
WHERE c."key" = 'nord-ai'
ON CONFLICT ("categoryId", "key") DO NOTHING;
