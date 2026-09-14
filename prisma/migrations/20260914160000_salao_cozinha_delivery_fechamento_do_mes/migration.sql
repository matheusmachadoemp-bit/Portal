-- Salão, Cozinha e Delivery ganham a mesma seção "Fechamento do mês" que o
-- Gerente já tem (ver 20260914140000_gerente_fechamento_do_mes e a migration
-- anterior a esta, 20260914150000_reuniao_custom_indicador_compartilhado,
-- que generalizou o mecanismo pra ReuniaoCustomIndicator/Value com
-- `meetingKey`): os campos hoje fixos de meta+premiação de cada uma viram
-- entradas de uma lista dinâmica (nome do indicador + 1 valor de
-- referência por mês, sem meta-alvo nem premiação), com o histórico já
-- lançado migrado pra dentro dela.
--
-- Indicadores migrados (na ordem que viram entradas da lista):
-- - Salão (3): NPS Geral (era "npsMetaPercent"), Faturamento do Salão (era
--   "faturamentoMetaValor"), Ticket Médio (era "ticketMedioMetaValor").
-- - Cozinha (4): CMV (era "cmvMetaPercent"), Desperdício (era
--   "desperdicioMetaValor"), Tempo Pedido (era "tempoPedidoMetaMinutos"),
--   Organização (era "organizacaoMetaPercent").
-- - Delivery (4): Cancelamento (era "cancelamentoMetaPercent"), Avaliação
--   (iFood) (era "avaliacaoMetaNota"), Tempo de Entrega (era
--   "tempoEntregaMetaMinutos"), Chamados (era "chamadosMetaPercent").
--
-- Ícone/unidade de cada indicador migrado combinam com o card equivalente já
-- usado nas telas atuais (ex.: NPS Geral com o ícone "Smile" do card de NPS
-- em salao-client.tsx) — só para a lista nascer com uma cara consistente;
-- quem usa o app pode trocar depois (IconPicker já existe na tela do
-- Gerente). "Avaliação (iFood)" e "Tempo Pedido"/"Tempo de Entrega" caem em
-- unidade NUMBER (não existe unidade "nota"/"minutos" própria — mesma
-- limitação que já existia pro enum antes desta migration).
--
-- valorPadrao de cada indicador = o DEFAULT que o campo fixo já tinha no
-- schema (ex.: cmvMetaPercent DEFAULT 30) — assim uma empresa nova, sem
-- nenhum histórico ainda, vê o mesmo valor de partida que já via antes.
--
-- Cada indicador é criado para TODA "Empresa" já cadastrada (mesmo padrão de
-- 20260914140000_gerente_fechamento_do_mes) — não só as que já têm
-- SalaoMeeting/KitchenMeeting/DeliveryMeeting — assim toda loja já vê os
-- indicadores disponíveis na seção "Fechamento do mês" a partir de agora,
-- mesmo que nunca tenha lançado essa reunião ainda. Os valores por período
-- (ReuniaoCustomIndicatorValue) só são criados para períodos que já tinham
-- de fato um registro lançado (a SELECT sobre a tabela de origem naturalmente
-- não devolve nada para uma empresa sem histórico).
--
-- Autor de cada indicador criado: quem lançou o fechamento mais antigo
-- daquela área nessa empresa; sem nenhum lançamento, cai pro ADMINISTRADOR
-- mais antigo cadastrado e, por fim, pro usuário mais antigo de qualquer
-- cargo (mesmo critério de 20260914140000_gerente_fechamento_do_mes). Banco
-- sem nenhum usuário: não tem pra quem atribuir "createdById" (FK
-- obrigatória), mas também não tem nenhum Meeting lançado ainda pra migrar —
-- pula a empresa sem erro.
--
-- Só depois do backfill os 6 campos de meta/premiação do Salão e os 8 da
-- Cozinha e do Delivery somem das 3 tabelas — a seção não grava mais neles;
-- "Resultado do período" (valores automáticos + os poucos campos ainda
-- digitados à mão) e "notas" continuam intocados.

DO $$
DECLARE
  emp RECORD;
  autorSalao TEXT;
  autorCozinha TEXT;
  autorDelivery TEXT;
  indNps TEXT;
  indFaturamentoSalao TEXT;
  indTicketMedio TEXT;
  indCmv TEXT;
  indDesperdicio TEXT;
  indTempoPedido TEXT;
  indOrganizacao TEXT;
  indCancelamento TEXT;
  indAvaliacao TEXT;
  indTempoEntrega TEXT;
  indChamados TEXT;
BEGIN
  FOR emp IN SELECT id FROM "Empresa" LOOP
    SELECT COALESCE(
      (SELECT "createdById" FROM "SalaoMeeting" WHERE "empresaId" = emp.id ORDER BY "createdAt" ASC LIMIT 1),
      (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
      (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
    ) INTO autorSalao;

    SELECT COALESCE(
      (SELECT "createdById" FROM "KitchenMeeting" WHERE "empresaId" = emp.id ORDER BY "createdAt" ASC LIMIT 1),
      (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
      (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
    ) INTO autorCozinha;

    SELECT COALESCE(
      (SELECT "createdById" FROM "DeliveryMeeting" WHERE "empresaId" = emp.id ORDER BY "createdAt" ASC LIMIT 1),
      (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
      (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
    ) INTO autorDelivery;

    -- As 3 variáveis compartilham a mesma cadeia de fallback global (mesmo
    -- ADMINISTRADOR/usuário mais antigo) — se uma resolve NULL (banco sem
    -- nenhum usuário), as outras duas também resolvem, então basta checar
    -- uma.
    IF autorSalao IS NULL THEN
      CONTINUE;
    END IF;

    -- Salão (3 indicadores)
    indNps := gen_random_uuid()::text;
    indFaturamentoSalao := gen_random_uuid()::text;
    indTicketMedio := gen_random_uuid()::text;
    INSERT INTO "ReuniaoCustomIndicator"
      ("id", "empresaId", "meetingKey", "nome", "icon", "unidade", "valorPadrao", "order", "createdById", "createdAt")
    VALUES
      (indNps, emp.id, 'SALAO', 'NPS Geral', 'Smile', 'PERCENT', 80, 0, autorSalao, CURRENT_TIMESTAMP),
      (indFaturamentoSalao, emp.id, 'SALAO', 'Faturamento do Salão', 'TrendingUp', 'CURRENCY', 0, 1, autorSalao, CURRENT_TIMESTAMP),
      (indTicketMedio, emp.id, 'SALAO', 'Ticket Médio', 'Receipt', 'CURRENCY', 0, 2, autorSalao, CURRENT_TIMESTAMP);

    INSERT INTO "ReuniaoCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indNps, sm."periodo", NULL, sm."npsMetaPercent"
    FROM "SalaoMeeting" sm WHERE sm."empresaId" = emp.id;

    INSERT INTO "ReuniaoCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indFaturamentoSalao, sm."periodo", NULL, sm."faturamentoMetaValor"
    FROM "SalaoMeeting" sm WHERE sm."empresaId" = emp.id;

    INSERT INTO "ReuniaoCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indTicketMedio, sm."periodo", NULL, sm."ticketMedioMetaValor"
    FROM "SalaoMeeting" sm WHERE sm."empresaId" = emp.id;

    -- Cozinha (4 indicadores)
    indCmv := gen_random_uuid()::text;
    indDesperdicio := gen_random_uuid()::text;
    indTempoPedido := gen_random_uuid()::text;
    indOrganizacao := gen_random_uuid()::text;
    INSERT INTO "ReuniaoCustomIndicator"
      ("id", "empresaId", "meetingKey", "nome", "icon", "unidade", "valorPadrao", "order", "createdById", "createdAt")
    VALUES
      (indCmv, emp.id, 'COZINHA', 'CMV', 'Percent', 'PERCENT', 30, 0, autorCozinha, CURRENT_TIMESTAMP),
      (indDesperdicio, emp.id, 'COZINHA', 'Desperdício', 'Trash2', 'CURRENCY', 450, 1, autorCozinha, CURRENT_TIMESTAMP),
      (indTempoPedido, emp.id, 'COZINHA', 'Tempo Pedido', 'Clock', 'NUMBER', 15, 2, autorCozinha, CURRENT_TIMESTAMP),
      (indOrganizacao, emp.id, 'COZINHA', 'Organização', 'Sparkles', 'PERCENT', 90, 3, autorCozinha, CURRENT_TIMESTAMP);

    INSERT INTO "ReuniaoCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indCmv, km."periodo", NULL, km."cmvMetaPercent"
    FROM "KitchenMeeting" km WHERE km."empresaId" = emp.id;

    INSERT INTO "ReuniaoCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indDesperdicio, km."periodo", NULL, km."desperdicioMetaValor"
    FROM "KitchenMeeting" km WHERE km."empresaId" = emp.id;

    INSERT INTO "ReuniaoCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indTempoPedido, km."periodo", NULL, km."tempoPedidoMetaMinutos"
    FROM "KitchenMeeting" km WHERE km."empresaId" = emp.id;

    INSERT INTO "ReuniaoCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indOrganizacao, km."periodo", NULL, km."organizacaoMetaPercent"
    FROM "KitchenMeeting" km WHERE km."empresaId" = emp.id;

    -- Delivery (4 indicadores)
    indCancelamento := gen_random_uuid()::text;
    indAvaliacao := gen_random_uuid()::text;
    indTempoEntrega := gen_random_uuid()::text;
    indChamados := gen_random_uuid()::text;
    INSERT INTO "ReuniaoCustomIndicator"
      ("id", "empresaId", "meetingKey", "nome", "icon", "unidade", "valorPadrao", "order", "createdById", "createdAt")
    VALUES
      (indCancelamento, emp.id, 'DELIVERY', 'Cancelamento', 'XCircle', 'PERCENT', 1, 0, autorDelivery, CURRENT_TIMESTAMP),
      (indAvaliacao, emp.id, 'DELIVERY', 'Avaliação (iFood)', 'Star', 'NUMBER', 4.7, 1, autorDelivery, CURRENT_TIMESTAMP),
      (indTempoEntrega, emp.id, 'DELIVERY', 'Tempo de Entrega', 'Truck', 'NUMBER', 40, 2, autorDelivery, CURRENT_TIMESTAMP),
      (indChamados, emp.id, 'DELIVERY', 'Chamados', 'PhoneCall', 'PERCENT', 2.5, 3, autorDelivery, CURRENT_TIMESTAMP);

    INSERT INTO "ReuniaoCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indCancelamento, dm."periodo", NULL, dm."cancelamentoMetaPercent"
    FROM "DeliveryMeeting" dm WHERE dm."empresaId" = emp.id;

    INSERT INTO "ReuniaoCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indAvaliacao, dm."periodo", NULL, dm."avaliacaoMetaNota"
    FROM "DeliveryMeeting" dm WHERE dm."empresaId" = emp.id;

    INSERT INTO "ReuniaoCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indTempoEntrega, dm."periodo", NULL, dm."tempoEntregaMetaMinutos"
    FROM "DeliveryMeeting" dm WHERE dm."empresaId" = emp.id;

    INSERT INTO "ReuniaoCustomIndicatorValue" ("id", "indicatorId", "periodo", "valor", "valorReferencia")
    SELECT gen_random_uuid()::text, indChamados, dm."periodo", NULL, dm."chamadosMetaPercent"
    FROM "DeliveryMeeting" dm WHERE dm."empresaId" = emp.id;
  END LOOP;
END $$;

-- Salão: 3 metas + 3 premiações somem.
ALTER TABLE "SalaoMeeting"
  DROP COLUMN "npsMetaPercent",
  DROP COLUMN "faturamentoMetaValor",
  DROP COLUMN "ticketMedioMetaValor",
  DROP COLUMN "premiacaoNps",
  DROP COLUMN "premiacaoFaturamento",
  DROP COLUMN "premiacaoTicketMedio";

-- Cozinha: 4 metas + 4 premiações somem.
ALTER TABLE "KitchenMeeting"
  DROP COLUMN "cmvMetaPercent",
  DROP COLUMN "desperdicioMetaValor",
  DROP COLUMN "tempoPedidoMetaMinutos",
  DROP COLUMN "organizacaoMetaPercent",
  DROP COLUMN "premiacaoCmv",
  DROP COLUMN "premiacaoDesperdicio",
  DROP COLUMN "premiacaoTempoPedido",
  DROP COLUMN "premiacaoOrganizacao";

-- Delivery: 4 metas + 4 premiações somem.
ALTER TABLE "DeliveryMeeting"
  DROP COLUMN "cancelamentoMetaPercent",
  DROP COLUMN "avaliacaoMetaNota",
  DROP COLUMN "tempoEntregaMetaMinutos",
  DROP COLUMN "chamadosMetaPercent",
  DROP COLUMN "premiacaoCancelamento",
  DROP COLUMN "premiacaoAvaliacao",
  DROP COLUMN "premiacaoTempoEntrega",
  DROP COLUMN "premiacaoChamados";
