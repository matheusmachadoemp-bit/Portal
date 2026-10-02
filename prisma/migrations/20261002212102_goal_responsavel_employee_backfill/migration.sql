-- Backfill de dado (achado #454, tarefa de "Início > Minha rotina — vínculos reais"): tenta
-- preencher a coluna nova "Goal"."responsavelEmployeeId" (ver migration anterior,
-- 20261002212046_goal_responsavel_employee_vinculo) a partir do texto já digitado em
-- "Goal"."responsavel" para toda meta já existente — sem isso, só metas criadas DEPOIS desta
-- migration (quando a rota de criar/editar meta passar a preencher o vínculo, se/quando isso for
-- feito) ganhariam o vínculo real, deixando toda meta antiga presa no cruzamento por texto antigo
-- (`loadRotinaMetas`, em src/lib/inicio.ts).
--
-- Critério de casamento, deliberadamente conservador — "sem vínculo" (NULL, cai para o
-- cruzamento por texto que já existe hoje) é sempre preferível a vincular errado:
--   1. Só casa "Employee" da MESMA loja ("Goal"."empresaId" = "Employee"."empresaId") — nunca
--      entre lojas diferentes, mesmo que o nome coincida.
--   2. Comparação por igualdade de texto, sem diferenciar maiúsculas/minúsculas nem espaços nas
--      pontas (`lower(trim(...))`) — mesma tolerância que `loadRotinaMetas` já aplica hoje no
--      cruzamento por texto (`mode: "insensitive"`). Não tenta normalizar acentuação/apelido/
--      nome composto: um pouco mais conservador que o ideal, mas evita o risco maior de uma
--      normalização agressiva demais juntar duas pessoas diferentes.
--   3. Só preenche quando existe EXATAMENTE 1 "Employee" daquela loja com esse nome
--      (normalizado) — nome ambíguo (duas pessoas, ou mais, com o mesmo nome na mesma loja) fica
--      de propósito sem vínculo (NULL) em vez de arriscar escolher a pessoa errada.
--   4. Exclui "category" = 'GERENCIA': o responsável de meta de Gerência é sempre um PAPEL fixo
--      ("Gerente", ver `GERENCIA_RESPONSAVEL` em src/lib/goals.ts — e a migration
--      20260919042954_goal_gerencia_responsavel_backfill, que já convergiu toda meta de Gerência
--      já existente para esse texto fixo), nunca uma pessoa específica — vincular isso a UM
--      "Employee" estaria errado por definição, não por falta de dado.
-- Idempotente: só atualiza linha com "responsavelEmployeeId" ainda NULL; rodar de novo não tem
-- efeito (a condição deixa de casar depois da primeira execução).
UPDATE "Goal" g
SET "responsavelEmployeeId" = match.employee_id
FROM (
  SELECT
    e."empresaId" AS empresa_id,
    lower(trim(e."name")) AS nome_normalizado,
    min(e."id") AS employee_id,
    count(*) AS total
  FROM "Employee" e
  GROUP BY e."empresaId", lower(trim(e."name"))
  HAVING count(*) = 1
) AS match
WHERE g."empresaId" = match.empresa_id
  AND lower(trim(g."responsavel")) = match.nome_normalizado
  AND g."responsavelEmployeeId" IS NULL
  AND g."category" != 'GERENCIA';
