-- Setores e Categorias de Estoque deixam de ser compartilhados entre TODAS as lojas do Grupo
-- Nord e passam a ser POR LOJA (empresaId) — achado de auditoria funcional do Teulis: como
-- "Estoque > Produtos" (abas Setores/Categorias) virou tela editável por qualquer usuário com
-- permissão de Estoque, um setor/categoria criado/editado/excluído numa loja afetava
-- IMEDIATAMENTE todas as outras lojas (testado ao vivo: criar um setor na Nord Pizza & Burger
-- fazia ele aparecer na hora também na Zarki Sushi). Antes disso era inofensivo (Setores era um
-- array hardcoded no código; Categorias, mesmo já sendo tabela, não tinha UI de
-- criar/editar/excluir exposta a usuários comuns). Perguntado, o Matheus (dono do Portal)
-- escolheu separar por loja em vez de manter compartilhado.
--
-- Estratégia de migração de dado (não só schema): para cada "Empresa" hoje cadastrada — TODAS,
-- não só "active = true" (mesmo critério já usado em
-- 20260914130000_fechamento_dia_backfill_catalogo, `FOR emp IN SELECT id FROM "Empresa" LOOP`
-- sem filtro de active — uma loja desativada ainda pode ter Ingredient/StockCount apontando pro
-- conjunto compartilhado antigo, e filtrar por "active" deixaria esses registros sem a cópia
-- correspondente) — DUPLICA cada StockSector/StockCategory hoje existente (compartilhado, ainda
-- sem empresaId neste ponto da migration), preservando name/key/order/color/icon/setor/
-- metaPerdaPercent/periodicidadeContagem/active/createdAt/updatedAt. Feito com INSERT...SELECT
-- set-based (não um loop PL/pgSQL linha a linha recriando conteúdo literal, diferente do
-- precedente de 20260914130000_fechamento_dia_backfill_catalogo): aqui o conteúdo a duplicar já
-- está no próprio banco — não precisa ser descrito à mão nesta migration, e funciona pra
-- qualquer quantidade de categorias/setores/lojas que existam no banco de destino no momento em
-- que a migration roda (inclusive um setor/categoria criado manualmente pela UI, não só os que
-- vieram do seed).
--
-- Depois de duplicar, `Ingredient.categoryId` é repontado da linha antiga compartilhada pra
-- cópia NOVA que pertence à MESMA loja do próprio Ingredient (casando pela "key", preservada na
-- duplicação) — nunca pra cópia de outra loja, senão a FK ficaria incoerente (ingrediente de uma
-- loja apontando pra categoria de outra). `Ingredient.setor`, `StockCount.setor`,
-- `StockCountItem.setor` e `StockCountSchedule.setor` continuam texto livre (nunca foram FK pra
-- StockSector — ver comentário do model em schema.prisma) — não precisam de remapeamento de ID,
-- só o NOME precisa continuar batendo com alguma linha de StockSector da loja certa, o que já
-- vale automaticamente: a duplicação acima preserva o nome em todas as cópias.
--
-- Por fim, as linhas antigas compartilhadas (ainda com empresaId NULL) são excluídas — seguro
-- porque (a) todo Ingredient que apontava pra elas já foi repontado pra cópia da própria loja
-- acima, e (b) StockSector nunca teve nenhuma FK restringindo exclusão (texto livre em todo
-- lugar que o referencia). Sem nenhuma Empresa cadastrada ainda (banco novo do zero, antes do
-- seed rodar), o CROSS JOIN com "Empresa" não produz nenhuma linha nova e o DELETE final
-- simplesmente limpa uma tabela que já está vazia — sem efeito colateral; é o cenário normal de
-- quem roda `prisma migrate deploy` antes de `npm run db:seed` num banco novo (prisma/seed.ts já
-- foi atualizado para semear StockSector/StockCategory por loja diretamente).

-- AlterTable: empresaId nullable por enquanto (preenchido pelo backfill abaixo, antes de virar
-- obrigatório mais adiante nesta mesma migration).
ALTER TABLE "StockCategory" ADD COLUMN "empresaId" TEXT;

-- AlterTable
ALTER TABLE "StockSector" ADD COLUMN "empresaId" TEXT;

-- DropIndex: a constraint única global ("key"/"name" sozinhos) precisa sair ANTES do backfill
-- abaixo duplicar o mesmo key/name em mais de uma loja — ela é substituída pela composta
-- (empresaId+key / empresaId+name) só no fim desta migration, depois que o dado já está
-- consistente.
DROP INDEX "StockCategory_key_key";

-- DropIndex
DROP INDEX "StockSector_name_key";

-- ============================================================================
-- Backfill de dado — ver racional completo no comentário no topo deste arquivo.
-- ============================================================================

-- 1) StockCategory: uma cópia por Empresa de cada categoria hoje compartilhada.
INSERT INTO "StockCategory" ("id", "empresaId", "key", "name", "color", "icon", "setor", "order", "metaPerdaPercent", "periodicidadeContagem", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."id", sc."key", sc."name", sc."color", sc."icon", sc."setor", sc."order", sc."metaPerdaPercent", sc."periodicidadeContagem", sc."active", sc."createdAt", sc."updatedAt"
FROM "StockCategory" sc
CROSS JOIN "Empresa" e
WHERE sc."empresaId" IS NULL;

-- 2) StockSector: mesma lógica, uma cópia por Empresa de cada setor hoje compartilhado.
INSERT INTO "StockSector" ("id", "empresaId", "name", "order", "active", "createdAt")
SELECT gen_random_uuid()::text, e."id", ss."name", ss."order", ss."active", ss."createdAt"
FROM "StockSector" ss
CROSS JOIN "Empresa" e
WHERE ss."empresaId" IS NULL;

-- 3) Ingredient.categoryId: repontar da linha antiga compartilhada pra cópia nova da MESMA loja
-- do ingrediente (casado por "key" + empresaId do próprio Ingredient). "antigo" e "novo" entram
-- como itens soltos da cláusula FROM (não um JOIN...ON explícito entre os dois) porque o
-- Postgres não permite referenciar a tabela alvo do UPDATE (`i`) dentro da condição ON de um
-- JOIN no FROM — só no WHERE (ou em condições de FROM-itens soltos, resolvidas junto do WHERE).
UPDATE "Ingredient" i
SET "categoryId" = novo."id"
FROM "StockCategory" antigo, "StockCategory" novo
WHERE i."categoryId" = antigo."id"
  AND antigo."empresaId" IS NULL
  AND novo."key" = antigo."key"
  AND novo."empresaId" = i."empresaId";

-- 4) Linhas antigas compartilhadas agora órfãs de propósito (todo Ingredient que apontava pra
-- elas já foi repontado acima) — removidas antes de "empresaId" virar obrigatório logo abaixo.
DELETE FROM "StockCategory" WHERE "empresaId" IS NULL;

-- (StockSector nunca teve nenhuma FK apontando pra ele — ver comentário do model em
-- schema.prisma — então não precisa de nenhum remapeamento antes desta exclusão.)
DELETE FROM "StockSector" WHERE "empresaId" IS NULL;

-- ============================================================================
-- Fecha o schema: empresaId obrigatório + FK + constraint única por loja.
-- ============================================================================

-- AlterTable
ALTER TABLE "StockCategory" ALTER COLUMN "empresaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "StockSector" ALTER COLUMN "empresaId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "StockCategory" ADD CONSTRAINT "StockCategory_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSector" ADD CONSTRAINT "StockSector_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "StockCategory_empresaId_key_key" ON "StockCategory"("empresaId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "StockSector_empresaId_name_key" ON "StockSector"("empresaId", "name");
