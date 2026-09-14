-- A seção "Metas e premiação" da Reunião Gerente deixa de comparar meta x
-- premiação e vira uma lista de referência (nome do indicador + 1 valor por
-- mês, sem meta-alvo nem premiação) — o mesmo mecanismo que "Ticket Médio
-- Salão"/"Ticket Médio Delivery" (GerenteCustomIndicator/
-- GerenteCustomIndicatorValue, criados em 20260914120000_gerente_custom_
-- indicadores) já usavam, só que também sem o campo de premiação deles.
--
-- 1) GerenteCustomIndicator: "metaPadrao" vira "valorPadrao" (RENAME, preserva
--    o valor default já cadastrado pra Ticket Médio Salão/Delivery em
--    produção); "premiacaoPadrao" e "direcao" (não existe mais "bater meta",
--    então a direção MIN/MAX deixou de fazer sentido) são removidos.
-- 2) GerenteCustomIndicatorValue: "metaValue" vira "valorReferencia" (RENAME,
--    preserva o histórico já lançado pra Ticket Médio Salão/Delivery);
--    "premiacaoValor" é removido. O campo "valor" (usado pela seção
--    "Resultado do período", que NÃO muda nesta tarefa — confirmado que lê
--    campos próprios/independentes, nunca os de meta/premiação) fica
--    intocado.
-- 3) Os 4 indicadores hoje fixos em GerenteMeeting (Faturamento, CMV,
--    Turnover, Checklist Operacional — campos "*MetaValor"/"*MetaPercent" +
--    "premiacao*") migram para dentro dessa mesma lista dinâmica, como as 4
--    primeiras entradas (order 0-3) de cada empresa — os indicadores que já
--    existiam são empurrados pra depois (order + 4). O valor de cada entrada
--    migrada é exatamente o que já estava gravado no campo de meta
--    correspondente (única coisa que a seção "Metas e premiação" gravava) —
--    um valor por período já lançado, sem perder histórico nenhum. Roda pra
--    toda "Empresa" já cadastrada (mesmo padrão de outros backfills deste
--    projeto, "FOR emp IN SELECT id FROM Empresa LOOP" — ex.:
--    20260914130000_fechamento_dia_backfill_catalogo), não só as que já têm
--    GerenteMeeting — assim nenhuma loja fica sem esses 4 indicadores
--    disponíveis daqui pra frente, do mesmo jeito que todas viam os 4 campos
--    fixos antes desta migration.
-- 4) Só depois do backfill, os 8 campos de meta/premiação somem de
--    GerenteMeeting (a seção não grava mais neles — "Resultado do período"
--    usa outras colunas, que continuam) e o enum GerenteIndicatorDirection
--    (sem mais nenhuma coluna usando) é removido.

-- 1) GerenteCustomIndicator
ALTER TABLE "GerenteCustomIndicator" RENAME COLUMN "metaPadrao" TO "valorPadrao";
ALTER TABLE "GerenteCustomIndicator" DROP COLUMN "premiacaoPadrao";
ALTER TABLE "GerenteCustomIndicator" DROP COLUMN "direcao";

-- 2) GerenteCustomIndicatorValue
ALTER TABLE "GerenteCustomIndicatorValue" RENAME COLUMN "metaValue" TO "valorReferencia";
ALTER TABLE "GerenteCustomIndicatorValue" DROP COLUMN "premiacaoValor";

-- 3) Backfill: os 4 indicadores fixos viram entradas da lista dinâmica.
DO $$
DECLARE
  emp RECORD;
  autor TEXT;
  indFaturamento TEXT;
  indCmv TEXT;
  indTurnover TEXT;
  indChecklist TEXT;
BEGIN
  FOR emp IN SELECT id FROM "Empresa" LOOP
    -- Autor: quem criou o fechamento mais antigo da Reunião Gerente dessa
    -- empresa (o mais contextual pra ela); se a empresa nunca lançou nenhum,
    -- cai pro ADMINISTRADOR mais antigo cadastrado e, por fim, pro usuário
    -- mais antigo de qualquer cargo — mesmo padrão de COALESCE de outras
    -- migrations deste projeto (ex.:
    -- 20260908150000_onboarding_universidade_curriculo,
    -- 20260914130000_fechamento_dia_backfill_catalogo).
    SELECT COALESCE(
      (SELECT "createdById" FROM "GerenteMeeting" WHERE "empresaId" = emp.id ORDER BY "createdAt" ASC LIMIT 1),
      (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
      (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
    ) INTO autor;

    -- Banco sem nenhum usuário (schema aplicado do zero, sem seed): não tem
    -- pra quem atribuir "createdById" (FK obrigatória) — mas também não tem
    -- GerenteMeeting nem GerenteCustomIndicator nenhum pra essa empresa
    -- ainda, então pula sem erro (mesma lógica seria necessária em qualquer
    -- backfill que dependa de já existir 1 usuário).
    IF autor IS NULL THEN
      CONTINUE;
    END IF;

    -- Abre espaço nas posições 0-3 pros 4 indicadores fixos, que viram as
    -- entradas iniciais da lista — mantém a ordem relativa de quem já
    -- existia (ex.: Ticket Médio Salão/Delivery), só empurrando todos +4.
    UPDATE "GerenteCustomIndicator" SET "order" = "order" + 4 WHERE "empresaId" = emp.id;

    indFaturamento := gen_random_uuid()::text;
    indCmv := gen_random_uuid()::text;
    indTurnover := gen_random_uuid()::text;
    indChecklist := gen_random_uuid()::text;

    INSERT INTO "GerenteCustomIndicator"
      ("id", "empresaId", "nome", "icon", "unidade", "valorPadrao", "order", "createdById", "createdAt")
    VALUES
      (indFaturamento, emp.id, 'Faturamento Total', 'DollarSign', 'CURRENCY', 0, 0, autor, CURRENT_TIMESTAMP),
      (indCmv, emp.id, 'CMV', 'Percent', 'PERCENT', 30, 1, autor, CURRENT_TIMESTAMP),
      (indTurnover, emp.id, 'Turnover', 'UserMinus', 'PERCENT', 5, 2, autor, CURRENT_TIMESTAMP),
      (indChecklist, emp.id, 'Checklist Operacional', 'ClipboardCheck', 'PERCENT', 90, 3, autor, CURRENT_TIMESTAMP);

    -- Um valor por período já lançado nessa empresa (GerenteMeeting),
    -- preservando exatamente o número que já estava no campo de meta
    -- correspondente — a única coisa que "Metas e premiação" gravava até
    -- hoje. "valor" (Resultado do período) fica NULL: essas 4 entradas
    -- migradas não têm resultado próprio nesta tabela — o resultado real de
    -- Faturamento/CMV/Turnover/Checklist continua nas colunas que
    -- permanecem em GerenteMeeting, intocadas por esta migration.
    INSERT INTO "GerenteCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indFaturamento, gm."periodo", NULL, gm."faturamentoMetaValor"
    FROM "GerenteMeeting" gm WHERE gm."empresaId" = emp.id;

    INSERT INTO "GerenteCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indCmv, gm."periodo", NULL, gm."cmvMetaPercent"
    FROM "GerenteMeeting" gm WHERE gm."empresaId" = emp.id;

    INSERT INTO "GerenteCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indTurnover, gm."periodo", NULL, gm."turnoverMetaPercent"
    FROM "GerenteMeeting" gm WHERE gm."empresaId" = emp.id;

    INSERT INTO "GerenteCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indChecklist, gm."periodo", NULL, gm."checklistOperacionalMetaPercent"
    FROM "GerenteMeeting" gm WHERE gm."empresaId" = emp.id;
  END LOOP;
END $$;

-- 4) Só agora os 8 campos de meta/premiação somem de GerenteMeeting, e o
--    enum de direção (sem mais nenhuma coluna usando) é removido.
ALTER TABLE "GerenteMeeting"
  DROP COLUMN "faturamentoMetaValor",
  DROP COLUMN "cmvMetaPercent",
  DROP COLUMN "turnoverMetaPercent",
  DROP COLUMN "checklistOperacionalMetaPercent",
  DROP COLUMN "premiacaoFaturamento",
  DROP COLUMN "premiacaoCmv",
  DROP COLUMN "premiacaoTurnover",
  DROP COLUMN "premiacaoChecklist";

DROP TYPE "GerenteIndicatorDirection";
