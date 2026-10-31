-- `DayOffType` é um catálogo GLOBAL (sem empresaId, ver comentário no bloco "RH — ESCALA DE
-- FOLGAS" em schema.prisma) cadastrado hoje de 2 formas: (1) pelo seed (prisma/seed.ts, só roda em
-- banco novo/dev que roda `npm run db:seed` do zero) e (2) pelo mini-formulário "+ Cadastrar novo
-- tipo..." dentro do próprio modal "Adicionar folga" (POST /api/rh/escala-folgas/day-off-types,
-- que já grava no banco de quem clicar). Nenhuma das 2 garante a linha em todo ambiente/produção
-- já existente: o deploy automático (scripts/migrate-deploy.sh) só roda `prisma migrate deploy`,
-- nunca `npm run db:seed`. Mesmo racional já usado por
-- 20260920120000_escala_folgas_menu_subcategoria (subcategoria "Escala de Folgas" no menu lateral)
-- pro mesmo problema.
--
-- O usuário pediu 2 tipos novos pra marcar eventos que na prática envolvem vários colaboradores de
-- setores diferentes no mesmo dia (ex.: "Aline Souza - CQ, Matheus Henrique - sushibar, Jonas
-- Lemos - Bar"): "Aniversário Coletivo" e "Dia da Massagem". Cores diferentes das já usadas
-- (folga-semanal #2952E3, folga-do-mes #8b5cf6, banco-de-horas #0ea5e9, compensacao #14b8a6,
-- ferias #f59e0b, afastamento #ef4444): laranja (#f97316) e rosa (#ec4899).
--
-- `kind = 'FOLGA'` (não FERIAS/AFASTAMENTO, que são reservados) e `isSystem = false` (editável/
-- desativável pela tela de administração do catálogo, igual folga-semanal/folga-do-mes/
-- banco-de-horas/compensacao) — mesmo padrão dos 4 tipos "normais" já existentes.
--
-- ON CONFLICT ("key") DO NOTHING: idempotente e nunca sobrescreve uma customização manual (nome/
-- cor/ordem já editados por um admin) se por acaso a linha já existir (ex.: alguém já cadastrou via
-- "+ Cadastrar novo tipo..." com o mesmo nome antes desta migration rodar) — mesma regra já usada
-- pela migration de subcategoria citada acima.

INSERT INTO "DayOffType" ("id", "key", "nome", "kind", "cor", "isSystem", "ativo", "ordem", "createdAt", "updatedAt")
VALUES
  ('dot-aniversario-coletivo', 'aniversario-coletivo', 'Aniversário Coletivo', 'FOLGA', '#f97316', false, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dot-dia-da-massagem', 'dia-da-massagem', 'Dia da Massagem', 'FOLGA', '#ec4899', false, true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
