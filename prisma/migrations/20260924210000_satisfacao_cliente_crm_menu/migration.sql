-- A pedido do Matheus: as 2 subcategorias da Fase 4 do módulo "Satisfação do Cliente" que já
-- têm tela publicada em produção (Visão Geral e Avaliações — branch
-- claude/satisfacao-cliente-fase4-ui, PR #418) mas ainda não apareciam em nenhum menu lateral
-- entram agora como subcategorias de CRM (categoria "crm"), NÃO da categoria
-- "satisfacao-cliente" (que fica só com Perguntas e QR Codes/Mesas, como já estava). Ver
-- comentário completo (racional de nome/posição/permissão) em prisma/seed.ts, junto de
-- `{ key: "visao-geral", ... }`/`{ key: "avaliacoes", ... }` dentro do bloco "crm".
--
-- Só dado (INSERT), sem alteração de schema: as colunas usadas já existem desde
-- prisma/migrations/20260420000000_init (ou equivalente) e nenhum enum/tabela nova é
-- necessário para isto.
--
-- Rotas físicas NÃO foram movidas — continuam em /portal/satisfacao-cliente/visao-geral e
-- /portal/satisfacao-cliente/avaliacoes (únicas pastas de rota reais; múltiplos outros pontos
-- do código, ex. src/lib/inicio.ts, src/lib/crm-dashboard.ts, src/lib/customer-survey-server.ts
-- e os links "Ver"/"voltar" das próprias telas, já apontam pra essas URLs e continuam
-- funcionando sem nenhuma mudança). src/app/portal/crm/visao-geral/page.tsx e
-- src/app/portal/crm/avaliacoes/page.tsx (adicionados nesta mesma atualização) só reexportam
-- essas páginas, pro link do menu — montado como `/portal/${categoria.key}/${subcategoria.key}`,
-- src/components/sidebar/sidebar.tsx — não virar um link morto (404). Mesmo padrão já usado por
-- vendas/visao-geral (prisma/migrations/20260915140000_vendas_visao_geral_subcategoria) e
-- tarefas/tarefas.
--
-- O gate de permissão das duas páginas e das rotas de API por trás delas (dashboard, avaliacoes,
-- motivos) passou de `hasModulePermission(..., "satisfacao-cliente", ...)` para
-- `hasModulePermission(..., "crm", ...)` nesta mesma atualização de código: o módulo de
-- permissão (`ModulePermission.moduleKey`, tela Perfis de Permissão) é uma STRING FIXA no
-- código, independente de qual `Category` a `Subcategory` está aninhada no banco — sem essa
-- correção, moveria o item de menu mas deixaria TRÊS coisas inconsistentes entre si: a
-- visibilidade do item no menu (`buildVisibilityResolver`, resolvida a partir da categoria
-- "crm" no banco — via este INSERT), o gate de acesso real da página/API (continuaria em
-- "satisfacao-cliente") e o seletor de permissão por usuário em Usuários > Novo usuário
-- (`src/app/portal/usuarios/usuarios-client.tsx`, que TAMBÉM deriva as subcategorias mostradas
-- sob cada módulo a partir de `Category`/`Subcategory`, então passaria a salvar um override
-- pontual como "crm:avaliacoes" — sem efeito nenhum se o código continuasse checando
-- "satisfacao-cliente:avaliacoes"). "Perguntas" e "QR Codes/Mesas" continuam sob o módulo
-- "satisfacao-cliente" (perfil próprio, inalterado).
--
-- `order` calculado como o próximo disponível dentro de CRM (em vez de um literal fixo) pra não
-- colidir com o que já existe em produção, sejam quais forem os valores atuais — a subcategoria
-- "satisfacao" (NPS antigo) foi removida de CRM por
-- prisma/migrations/20260924190000_remove_satisfacao_subcategoria_crm sem renumerar as
-- irmãs, então não dá pra assumir uma sequência 0..N-1 contígua sem consultar. As duas ficam
-- depois de todas as subcategorias de CRM já existentes (Visão Geral do próprio CRM, Clientes,
-- Funil, Campanhas, Automações, Fidelidade, Aniversariantes, Inteligência de Cliente).
--
-- Nome "Visão Geral (Satisfação)" (não só "Visão Geral") pra não duplicar o rótulo da
-- subcategoria "dashboard" já existente em CRM (a Visão Geral do próprio CRM).
INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT
  'sub-crm-visao-geral-satisfacao',
  c."id",
  'visao-geral',
  'Visão Geral (Satisfação)',
  'Smile',
  '#2952E3',
  COALESCE((SELECT MAX(s."order") FROM "Subcategory" s WHERE s."categoryId" = c."id"), -1) + 1,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Category" c
WHERE c."key" = 'crm'
ON CONFLICT ("categoryId", "key") DO NOTHING;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT
  'sub-crm-avaliacoes',
  c."id",
  'avaliacoes',
  'Avaliações',
  'ClipboardCheck',
  '#2952E3',
  COALESCE((SELECT MAX(s."order") FROM "Subcategory" s WHERE s."categoryId" = c."id"), -1) + 1,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Category" c
WHERE c."key" = 'crm'
ON CONFLICT ("categoryId", "key") DO NOTHING;
