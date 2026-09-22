-- CreateIndex
-- Índice PARCIAL: só cobre ocorrências de checklist "abertas" (status fora
-- da lista de estados terminais), que é exatamente o filtro usado por
-- `src/app/portal/tarefas/checklist/page.tsx` (query de `existing` antes de
-- `refreshOccurrenceStatuses`) toda vez que a tela de Checklists é aberta.
--
-- Sem esse índice, o único índice existente em ChecklistOccurrence é
-- (empresaId, date) — inútil aqui porque a query não filtra por `date` (ela
-- precisa olhar TODO o histórico em aberto, não só o dia atual). O Postgres
-- caía num Seq Scan em toda a tabela da(s) loja(s), que só cresce com o
-- tempo. Por ser parcial, este índice cobre só as linhas não-terminais — uma
-- ocorrência sai dele sozinha assim que vira terminal, então o índice não
-- cresce com o histórico acumulado (validado com EXPLAIN ANALYZE, ver
-- relatório da tarefa).
--
-- ATENÇÃO — sincronização manual: a lista de status abaixo precisa ser
-- IDÊNTICA a `CHECKLIST_TERMINAL_STATUSES` em `src/lib/checklist.ts` (os
-- status que ficam FORA do WHERE, ou seja, os que são excluídos do índice
-- por serem terminais). O Prisma Schema Language não tem suporte
-- declarativo a índice parcial (WHERE), então o `@@index([empresaId])` em
-- `prisma/schema.prisma` no model ChecklistOccurrence é só um placeholder
-- para o Prisma reconhecer que existe um índice ali — a definição real está
-- só aqui. Se `CHECKLIST_TERMINAL_STATUSES` mudar no futuro (um status novo
-- for adicionado/removido da lista de terminais), esta migration precisa
-- ganhar uma migration nova (DROP + CREATE) com o WHERE atualizado — não há
-- como o Prisma manter isso sincronizado sozinho.
CREATE INDEX "ChecklistOccurrence_empresaId_open_idx"
  ON "ChecklistOccurrence" ("empresaId")
  WHERE status NOT IN ('CONCLUIDO_NO_PRAZO', 'CONCLUIDO_COM_ATRASO', 'JUSTIFICADO', 'CANCELADO', 'NAO_REALIZADO');
