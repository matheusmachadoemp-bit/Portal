-- CreateIndex
-- Índice ÚNICO PARCIAL: garante, no banco, no máximo 1 linha com
-- "fixaNotaGeral" = true em toda a tabela CustomerSurveyQuestion (achado do
-- Teulis na revisão da Fase 2) — fecha a corrida que `ensureFixedNotaGeralQuestion`
-- (src/lib/customer-survey-server.ts) podia perder: dois primeiros acessos
-- concorrentes (nenhum encontra a linha ainda) tentando criar a pergunta fixa
-- ao mesmo tempo. Antes desta migration isso dependia só da aplicação nunca
-- errar; agora o Postgres rejeita a segunda tentativa com violação de
-- constraint (P2002), que a função trata pegando a linha que a primeira
-- tentativa concorrente já criou (mesmo padrão de retry que
-- `isNumeroConflict`, em src/app/api/satisfacao-cliente/mesas/route.ts, já
-- usa para número de mesa duplicado).
--
-- O Prisma Schema Language não tem suporte declarativo a índice único
-- PARCIAL (cláusula WHERE) — mesma limitação já documentada em
-- prisma/migrations/20260922202311_checklist_occurrence_open_partial_index
-- (ChecklistOccurrence). Diferente daquele caso, aqui NÃO existe nenhum
-- `@@index`/`@@unique` "placeholder" correspondente em prisma/schema.prisma:
-- um `@@unique([fixaNotaGeral])` comum (sem WHERE) descreveria uma coisa
-- FALSA e perigosa — um unique não-parcial numa coluna booleana limitaria a
-- tabela inteira a no máximo 1 linha com fixaNotaGeral=false também,
-- quebrando todas as perguntas regulares. Por isso este índice vive só
-- aqui, sem nenhuma tentativa de representá-lo no schema — validado
-- manualmente (`prisma migrate dev` do zero, ver relatório) que isso não
-- gera nenhum "drift" nem tentativa de recriar/remover o índice.
CREATE UNIQUE INDEX "CustomerSurveyQuestion_fixaNotaGeral_unique_true"
  ON "CustomerSurveyQuestion" ("fixaNotaGeral")
  WHERE "fixaNotaGeral" = true;
