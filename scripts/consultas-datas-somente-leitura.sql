-- ============================================================================================================
-- (1) INVENTARIO. Somente leitura. Rode ANTES e DEPOIS de publicar. Conta, por coluna de data, quantas celulas
-- estao em cada "hora": meia_noite_utc = 00:00:00.000 (convencao antiga, a tela mostra 1 dia ANTES do digitado
-- em Sao Paulo); meia_noite_sp = 03:00:00.000 (convencao nova); outra_hora = hora real (nao e tocada); vazias
-- = sem data.
-- ============================================================================================================
SELECT t.tabela, e.key AS coluna, count(*) AS total,
       count(*) FILTER (WHERE e.value::timestamp = date_trunc('day', e.value::timestamp)) AS meia_noite_utc,
       count(*) FILTER (WHERE e.value::timestamp = date_trunc('day', e.value::timestamp) + interval '3 hours') AS meia_noite_sp,
       count(*) FILTER (WHERE e.value IS NOT NULL
                          AND e.value::timestamp <> date_trunc('day', e.value::timestamp)
                          AND e.value::timestamp <> date_trunc('day', e.value::timestamp) + interval '3 hours') AS outra_hora,
       count(*) FILTER (WHERE e.value IS NULL) AS vazias
  FROM (SELECT 'Payable' AS tabela, to_jsonb(x) AS j FROM "Payable" x
        UNION ALL SELECT 'Receivable', to_jsonb(x) FROM "Receivable" x
        UNION ALL SELECT 'RecurringTemplate', to_jsonb(x) FROM "RecurringTemplate" x
        UNION ALL SELECT 'Purchase', to_jsonb(x) FROM "Purchase" x
        UNION ALL SELECT 'SupplierInvoice', to_jsonb(x) FROM "SupplierInvoice" x) t
 CROSS JOIN LATERAL jsonb_each_text(t.j) e
 WHERE e.key IN ('dataCompetencia','dataVencimento','dataPagamento','dataRecebimento','dataInicio','data','previsaoEntrega','dataCompra')
 GROUP BY 1, 2 ORDER BY 1, 2;

-- ============================================================================================================
-- (2) CONTAS QUE "RECUARAM" por salvar-sem-mexer (candidatas; o dono decide conta a conta). Somente leitura.
-- Procura no historico (AuditLog) edicoes em que uma data caiu EXATAMENTE 1 dia. 2 ou mais datas da MESMA
-- edicao = assinatura do defeito. A migration NAO corrige essas contas. competencia_trocou_de_mes = true: a
-- conta mudou de mes no DRE.
-- ============================================================================================================
WITH base AS MATERIALIZED (
    SELECT a."id", a."entityType", a."entityId", a."createdAt", a."before"::json AS antes, a."after"::json AS depois
      FROM "AuditLog" a
     WHERE a."entityType" IN ('Payable','Receivable') AND a."action" = 'UPDATE'
       AND a."before" LIKE '{%' AND a."after" LIKE '{%'
), colunas AS (
    SELECT b.*, c.coluna, (b.antes ->> c.coluna) AS v_antes, (b.depois ->> c.coluna) AS v_depois
      FROM base b
     CROSS JOIN (VALUES ('dataCompetencia'),('dataVencimento'),('dataPagamento'),('dataRecebimento')) AS c(coluna)
     WHERE (b.antes ->> c.coluna) IS NOT NULL AND (b.depois ->> c.coluna) IS NOT NULL
), recuos AS (
    SELECT "id", "entityType", "entityId", "createdAt",
           count(*) AS datas_que_recuaram_1_dia,
           string_agg(coluna || ': ' || to_char(v_antes::timestamp, 'DD/MM/YYYY') || ' -> ' || to_char(v_depois::timestamp, 'DD/MM/YYYY'), '; ' ORDER BY coluna) AS detalhe,
           coalesce(bool_or(coluna = 'dataCompetencia' AND to_char(v_antes::timestamp, 'YYYY-MM') <> to_char(v_depois::timestamp, 'YYYY-MM')), false) AS competencia_trocou_de_mes
      FROM colunas
     WHERE v_antes::timestamp - v_depois::timestamp = INTERVAL '1 day'
     GROUP BY "id", "entityType", "entityId", "createdAt"
)
SELECT r."entityType" AS tipo,
       coalesce(p."number", rc."number") AS numero,
       coalesce(p."fornecedor", rc."cliente") AS fornecedor_ou_cliente,
       coalesce(p."valor", rc."valor") AS valor,
       to_char(coalesce(p."dataVencimento", rc."dataVencimento"), 'DD/MM/YYYY') AS vencimento_gravado_hoje,
       r."createdAt" AS editada_em,
       r.datas_que_recuaram_1_dia, r.detalhe, r.competencia_trocou_de_mes,
       CASE WHEN r.datas_que_recuaram_1_dia >= 2 THEN 'provavel salvar-sem-mexer' ELSE 'pode ter sido ajuste de proposito' END AS leitura,
       r."entityId" AS id_da_conta
  FROM recuos r
  LEFT JOIN "Payable" p ON r."entityType" = 'Payable' AND p."id" = r."entityId"
  LEFT JOIN "Receivable" rc ON r."entityType" = 'Receivable' AND rc."id" = r."entityId"
 ORDER BY r."entityType", coalesce(p."number", rc."number"), r."createdAt";

-- ============================================================================================================
-- (3) FLUXO DE CAIXA, por MES: pagamentos/recebimentos que mudam de mes no Fluxo depois da correcao. Somente
-- leitura.
-- ============================================================================================================
SELECT tipo,
       to_char(dia_gravado - INTERVAL '3 hours', 'YYYY-MM') AS mes_no_fluxo_hoje,
       to_char(dia_gravado, 'YYYY-MM') AS mes_no_fluxo_depois,
       count(*) AS lancamentos, round(sum(valor)::numeric, 2) AS total
  FROM (SELECT 'Pago' AS tipo, "dataPagamento" AS dia_gravado, "valor" FROM "Payable"
         WHERE "status" IN ('PAGO','PARCIALMENTE_PAGO') AND "dataPagamento" = date_trunc('day', "dataPagamento")
        UNION ALL
        SELECT 'Recebido', "dataRecebimento", "valor" FROM "Receivable"
         WHERE "status" IN ('PAGO','PARCIALMENTE_PAGO') AND "dataRecebimento" = date_trunc('day', "dataRecebimento")) x
 WHERE to_char(dia_gravado - INTERVAL '3 hours', 'YYYY-MM') <> to_char(dia_gravado, 'YYYY-MM')
 GROUP BY 1, 2, 3 ORDER BY 2, 1;

-- ============================================================================================================
-- (3b) FLUXO DE CAIXA, por DIA (ultimos 14 dias): em que dia cada pagamento/recebimento aparece HOJE e em que
-- dia vai aparecer DEPOIS. Todo lancamento ainda em 00:00Z anda 1 dia. Somente leitura.
-- ============================================================================================================
SELECT tipo,
       to_char(dia_gravado - INTERVAL '3 hours', 'DD/MM/YYYY') AS dia_no_fluxo_hoje,
       to_char(dia_gravado, 'DD/MM/YYYY') AS dia_no_fluxo_depois,
       count(*) AS lancamentos, round(sum(valor)::numeric, 2) AS total
  FROM (SELECT 'Pago' AS tipo, "dataPagamento" AS dia_gravado, "valor" FROM "Payable"
         WHERE "status" IN ('PAGO','PARCIALMENTE_PAGO') AND "dataPagamento" = date_trunc('day', "dataPagamento")
        UNION ALL
        SELECT 'Recebido', "dataRecebimento", "valor" FROM "Receivable"
         WHERE "status" IN ('PAGO','PARCIALMENTE_PAGO') AND "dataRecebimento" = date_trunc('day', "dataRecebimento")) x
 WHERE dia_gravado >= (now() AT TIME ZONE 'UTC') - INTERVAL '14 days'
 GROUP BY 1, dia_gravado ORDER BY dia_gravado DESC, 1;

-- ============================================================================================================
-- (4) CONTAS A PAGAR EM ABERTO (proximos 14 dias): o dia que a tela mostra HOJE x o dia que vai mostrar depois
-- da correcao (o digitado). Para conferir com os boletos. Somente leitura. So as que ainda estao em 00:00 UTC.
-- ============================================================================================================
SELECT "number" AS numero, "fornecedor", "valor",
       to_char("dataVencimento" - INTERVAL '3 hours', 'DD/MM/YYYY') AS tela_mostra_hoje,
       to_char("dataVencimento", 'DD/MM/YYYY') AS tela_vai_mostrar
  FROM "Payable"
 WHERE "status" NOT IN ('PAGO','CANCELADO')
   AND "dataVencimento" = date_trunc('day', "dataVencimento")
   AND ("dataVencimento" - INTERVAL '3 hours') >= (now() AT TIME ZONE 'UTC') - INTERVAL '1 day'
   AND ("dataVencimento" - INTERVAL '3 hours') <  (now() AT TIME ZONE 'UTC') + INTERVAL '14 days'
 ORDER BY "dataVencimento", "number"
 LIMIT 300;

-- ============================================================================================================
-- (5) ASSINATURA DOS DIAS. Somente leitura. Rode ANTES e DEPOIS da migration, com a loja fechada: as colunas
-- "assinatura" tem que sair IDENTICAS (mesma conta, mesmo valor, mesmo status, mesmo DIA; so a hora muda). Se
-- alguma mudar, pare e chame quem mantem o sistema.
-- ============================================================================================================
SELECT 'Payable' AS tabela, count(*) AS linhas,
       md5(coalesce(string_agg(concat_ws('|', "id", "valor", "status", "dataCompetencia"::date, "dataVencimento"::date, coalesce("dataPagamento"::date::text, '-')), ';' ORDER BY "id"), '')) AS assinatura
  FROM "Payable"
UNION ALL
SELECT 'Receivable', count(*),
       md5(coalesce(string_agg(concat_ws('|', "id", "valor", "status", "dataCompetencia"::date, "dataVencimento"::date, coalesce("dataRecebimento"::date::text, '-')), ';' ORDER BY "id"), ''))
  FROM "Receivable"
UNION ALL
SELECT 'RecurringTemplate', count(*),
       md5(coalesce(string_agg(concat_ws('|', "id", "valor", "dataInicio"::date), ';' ORDER BY "id"), ''))
  FROM "RecurringTemplate"
UNION ALL
SELECT 'Purchase (sem a data das compras criadas entre 21h e 23h59)', count(*),
       md5(coalesce(string_agg(concat_ws('|', "id", "status",
             CASE WHEN EXTRACT(HOUR FROM "createdAt") >= 3 THEN "data"::date::text ELSE '-' END,
             coalesce("previsaoEntrega"::date::text, '-'), coalesce("dataVencimento"::date::text, '-')), ';' ORDER BY "id"), ''))
  FROM "Purchase"
UNION ALL
SELECT 'SupplierInvoice', count(*),
       md5(coalesce(string_agg(concat_ws('|', "id", "totalCobrado", "dataCompra"::date), ';' ORDER BY "id"), ''))
  FROM "SupplierInvoice"
UNION ALL
SELECT 'Saldo das contas bancarias', count(*), md5(coalesce(string_agg(concat_ws('|', "id", "saldoAtual"), ';' ORDER BY "id"), ''))
  FROM "BankAccount";

-- ============================================================================================================
-- (6) COMPRAS DO ESTOQUE criadas entre 21:00 e 23:59 de Sao Paulo com o dia PADRAO do formulario (dia UTC =
-- amanha). Somente leitura. A migration trata essas compras a parte (opcao A: mantem o dia que a tela mostra
-- hoje).
-- ============================================================================================================
SELECT count(*) OVER () AS total_de_compras_nessa_situacao,
       pu."numeroNota" AS nota, s."razaoSocial" AS fornecedor,
       to_char(pu."createdAt" - INTERVAL '3 hours', 'DD/MM/YYYY HH24:MI') AS cadastrada_em_sp,
       to_char(pu."data" - INTERVAL '3 hours', 'DD/MM/YYYY') AS tela_mostra_hoje,
       to_char(pu."data" - INTERVAL '21 hours', 'DD/MM/YYYY') AS opcao_A_mantem_o_que_a_tela_mostra,
       to_char(pu."data", 'DD/MM/YYYY') AS opcao_B_passa_a_mostrar
  FROM "Purchase" pu
  LEFT JOIN "Supplier" s ON s."id" = pu."supplierId"
 WHERE pu."data" = date_trunc('day', pu."data")
   AND pu."data"::date = pu."createdAt"::date
   AND EXTRACT(HOUR FROM pu."createdAt") < 3
 ORDER BY pu."createdAt" DESC
 LIMIT 300;

-- ============================================================================================================
-- (7) COMPRAS DO ESTOQUE que mudam de MES no filtro de periodo depois da correcao. Somente leitura.
-- ============================================================================================================
SELECT mes_hoje AS mes_no_filtro_de_compras_hoje, mes_depois AS mes_depois_da_correcao, count(*) AS compras
  FROM (SELECT to_char("data" - INTERVAL '3 hours', 'YYYY-MM') AS mes_hoje,
               to_char((CASE WHEN "data" <> date_trunc('day', "data") THEN "data"
                             WHEN "data"::date = "createdAt"::date AND EXTRACT(HOUR FROM "createdAt") < 3 THEN "data" - INTERVAL '21 hours'
                             ELSE "data" + INTERVAL '3 hours' END) - INTERVAL '3 hours', 'YYYY-MM') AS mes_depois
          FROM "Purchase") x
 WHERE mes_hoje <> mes_depois
 GROUP BY 1, 2 ORDER BY 1;

-- ============================================================================================================
-- (8) RECEBIMENTO: pedidos atrasados HOJE x DEPOIS da correcao (indicador "Pedidos atrasados" / taxa de atraso
-- do fornecedor). Somente leitura.
-- ============================================================================================================
SELECT count(*) AS recebimentos_com_previsao,
       count(*) FILTER (WHERE r."dataFim" > p."previsaoEntrega") AS atrasados_hoje,
       count(*) FILTER (WHERE r."dataFim" > CASE WHEN p."previsaoEntrega" = date_trunc('day', p."previsaoEntrega")
                                                  THEN p."previsaoEntrega" + INTERVAL '3 hours' ELSE p."previsaoEntrega" END) AS atrasados_depois
  FROM "Receiving" r
  JOIN "Purchase" p ON p."id" = r."purchaseId"
 WHERE p."previsaoEntrega" IS NOT NULL AND r."dataFim" IS NOT NULL;

-- ============================================================================================================
-- (9) CONCILIACAO BANCARIA (estimativa): lancamentos pendentes do extrato que tem conta candidata (mesmo
-- valor, ate 5 dias) HOJE x DEPOIS da correcao. Somente leitura.
-- ============================================================================================================
WITH pend AS (
    SELECT t."id", t."empresaId", t."direction"::text AS direction, t."valor", t."date"
      FROM "BankTransaction" t
     WHERE t."status" = 'PENDENTE' AND t."pendingAtBank" = false
), cand AS (
    SELECT 'SAIDA' AS direction, "empresaId", "valor", coalesce("dataPagamento", "dataVencimento") AS dia
      FROM "Payable" WHERE "status" IN ('EM_ABERTO','PARCIALMENTE_PAGO','ATRASADO')
    UNION ALL
    SELECT 'ENTRADA', "empresaId", "valor", coalesce("dataRecebimento", "dataVencimento")
      FROM "Receivable" WHERE "status" IN ('EM_ABERTO','PARCIALMENTE_PAGO','ATRASADO')
)
SELECT count(*) AS lancamentos_pendentes_no_extrato,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM cand c
                         WHERE c.direction = p.direction AND c."empresaId" = p."empresaId" AND abs(c."valor" - p."valor") <= 0.005
                           AND abs(extract(epoch FROM (c.dia - p."date"))) / 86400 <= 5)) AS com_conta_candidata_hoje,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM cand c
                         WHERE c.direction = p.direction AND c."empresaId" = p."empresaId" AND abs(c."valor" - p."valor") <= 0.005
                           AND abs(extract(epoch FROM ((CASE WHEN c.dia = date_trunc('day', c.dia) THEN c.dia + INTERVAL '3 hours' ELSE c.dia END) - p."date"))) / 86400 <= 5)) AS com_conta_candidata_depois
  FROM pend p;

-- ============================================================================================================
-- (10) EXTRA, fora do escopo pedido: "Caixa da Empresa" (CashMovement.date) tem o mesmo defeito
-- (src/app/api/financeiro/caixa/route.ts:101 grava new Date("AAAA-MM-DD"); a lista mostra com format() no fuso
-- do navegador). Somente leitura: so mede quantos lancamentos estao em 00:00 UTC.
-- ============================================================================================================
SELECT count(*) AS total,
       count(*) FILTER (WHERE "date" = date_trunc('day', "date")) AS meia_noite_utc,
       count(*) FILTER (WHERE "date" = date_trunc('day', "date") + INTERVAL '3 hours') AS meia_noite_sp,
       count(*) FILTER (WHERE "date" <> date_trunc('day', "date") AND "date" <> date_trunc('day', "date") + INTERVAL '3 hours') AS outra_hora
  FROM "CashMovement";
