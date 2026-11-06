-- A pedido do usuário (Matheus): remove de verdade a subcategoria "Indicadores" (categoria
-- "Produção") do menu lateral — ela já tinha sido desativada (active = false, ver migration
-- 20261106000000_remove_indicadores_subcategoria_producao) quando o conteúdo foi incorporado à
-- "Visão Geral", mas `active = false` ainda deixa a linha visível (esmaecida, clicável) pra
-- admin/gestor — pensado pra um estado TRANSITÓRIO em que o admin pode querer reativar ou excluir
-- (ver `isSubcategoryVisible` em src/components/sidebar/subcategory-visibility.ts). Esse não é o
-- caso aqui: a tela foi definitivamente juntada a outra, não existe ação de gestão esperada, e o
-- usuário via essa linha esmaecida sem entender por quê (ao clicar, era redirecionado pra "Visão
-- Geral" em vez de abrir uma tela própria).
--
-- Adiciona a coluna `hidden` (Subcategory.hidden, default false pra todo o resto) e já marca esta
-- linha como hidden = true: uma subcategoria hidden nunca aparece no menu lateral pra ninguém,
-- nem admin (ver schema.prisma e subcategory-visibility.ts). Continua sem hard DELETE pelo mesmo
-- motivo da migration anterior: `isSystem = true` e referência de FeedbackReport.subcategoriaId
-- sem onDelete Cascade — excluir quebraria a FK se algum colaborador já tiver registrado feedback
-- com "Produção > Indicadores" como módulo afetado.
ALTER TABLE "Subcategory" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Subcategory"
SET "hidden" = true
WHERE "key" = 'indicadores'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'producao');
