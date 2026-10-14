-- VARREDURA: mesma regra da migration 20261014000000_financeiro_datas_meia_noite_sp, rodada de novo para pegar
-- linhas que o codigo ANTIGO ou uma aba antiga tenha gravado em 00:00:00.000 DEPOIS da migration (ficam com a
-- data 1 dia antes na tela). Soma exatas 3h so onde esta exatamente em 00:00:00.000 (unica excecao: Purchase.data
-- de compra criada entre 21:00 e 23:59 de Sao Paulo com o dia padrao do formulario, que recebe data - 21h: ver o
-- bloco "Purchase.data"); cada celula vai para "backup_datas_sp"."data_antiga" com a rodada
-- "varredura-AAAAMMDDTHHMMSS" (hora do servidor, UTC). Idempotente.
-- Antes, rode a consulta (1) de scripts/consultas-datas-somente-leitura.sql (inventario): se "meia_noite_utc" for
-- 0 em todas as linhas, nao ha nada a varrer.

BEGIN;

CREATE SCHEMA IF NOT EXISTS "backup_datas_sp";

CREATE TABLE IF NOT EXISTS "backup_datas_sp"."data_antiga" (
    "rodada"       TEXT         NOT NULL,
    "tabela"       TEXT         NOT NULL,
    "coluna"       TEXT         NOT NULL,
    "id"           TEXT         NOT NULL,
    "valor_antigo" TIMESTAMP(3) NOT NULL,
    "valor_novo"   TIMESTAMP(3) NOT NULL,
    "criado_em"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertido_em" TIMESTAMP(3),
    CONSTRAINT "data_antiga_pkey" PRIMARY KEY ("tabela", "coluna", "id", "rodada")
);

-- Payable.dataCompetencia
WITH alterado AS (
    UPDATE "Payable"
       SET "dataCompetencia" = "dataCompetencia" + INTERVAL '3 hours'
     WHERE "dataCompetencia" = date_trunc('day', "dataCompetencia")
    RETURNING "id", "dataCompetencia" AS novo
)
INSERT INTO "backup_datas_sp"."data_antiga" ("rodada", "tabela", "coluna", "id", "valor_antigo", "valor_novo")
SELECT 'varredura-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'), 'Payable', 'dataCompetencia', "id", novo - INTERVAL '3 hours', novo FROM alterado
ON CONFLICT ("tabela", "coluna", "id", "rodada")
DO UPDATE SET "valor_antigo" = EXCLUDED."valor_antigo", "valor_novo" = EXCLUDED."valor_novo", "revertido_em" = NULL;

-- Payable.dataVencimento
WITH alterado AS (
    UPDATE "Payable"
       SET "dataVencimento" = "dataVencimento" + INTERVAL '3 hours'
     WHERE "dataVencimento" = date_trunc('day', "dataVencimento")
    RETURNING "id", "dataVencimento" AS novo
)
INSERT INTO "backup_datas_sp"."data_antiga" ("rodada", "tabela", "coluna", "id", "valor_antigo", "valor_novo")
SELECT 'varredura-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'), 'Payable', 'dataVencimento', "id", novo - INTERVAL '3 hours', novo FROM alterado
ON CONFLICT ("tabela", "coluna", "id", "rodada")
DO UPDATE SET "valor_antigo" = EXCLUDED."valor_antigo", "valor_novo" = EXCLUDED."valor_novo", "revertido_em" = NULL;

-- Payable.dataPagamento
WITH alterado AS (
    UPDATE "Payable"
       SET "dataPagamento" = "dataPagamento" + INTERVAL '3 hours'
     WHERE "dataPagamento" = date_trunc('day', "dataPagamento")
    RETURNING "id", "dataPagamento" AS novo
)
INSERT INTO "backup_datas_sp"."data_antiga" ("rodada", "tabela", "coluna", "id", "valor_antigo", "valor_novo")
SELECT 'varredura-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'), 'Payable', 'dataPagamento', "id", novo - INTERVAL '3 hours', novo FROM alterado
ON CONFLICT ("tabela", "coluna", "id", "rodada")
DO UPDATE SET "valor_antigo" = EXCLUDED."valor_antigo", "valor_novo" = EXCLUDED."valor_novo", "revertido_em" = NULL;

-- Receivable.dataCompetencia
WITH alterado AS (
    UPDATE "Receivable"
       SET "dataCompetencia" = "dataCompetencia" + INTERVAL '3 hours'
     WHERE "dataCompetencia" = date_trunc('day', "dataCompetencia")
    RETURNING "id", "dataCompetencia" AS novo
)
INSERT INTO "backup_datas_sp"."data_antiga" ("rodada", "tabela", "coluna", "id", "valor_antigo", "valor_novo")
SELECT 'varredura-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'), 'Receivable', 'dataCompetencia', "id", novo - INTERVAL '3 hours', novo FROM alterado
ON CONFLICT ("tabela", "coluna", "id", "rodada")
DO UPDATE SET "valor_antigo" = EXCLUDED."valor_antigo", "valor_novo" = EXCLUDED."valor_novo", "revertido_em" = NULL;

-- Receivable.dataVencimento
WITH alterado AS (
    UPDATE "Receivable"
       SET "dataVencimento" = "dataVencimento" + INTERVAL '3 hours'
     WHERE "dataVencimento" = date_trunc('day', "dataVencimento")
    RETURNING "id", "dataVencimento" AS novo
)
INSERT INTO "backup_datas_sp"."data_antiga" ("rodada", "tabela", "coluna", "id", "valor_antigo", "valor_novo")
SELECT 'varredura-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'), 'Receivable', 'dataVencimento', "id", novo - INTERVAL '3 hours', novo FROM alterado
ON CONFLICT ("tabela", "coluna", "id", "rodada")
DO UPDATE SET "valor_antigo" = EXCLUDED."valor_antigo", "valor_novo" = EXCLUDED."valor_novo", "revertido_em" = NULL;

-- Receivable.dataRecebimento
WITH alterado AS (
    UPDATE "Receivable"
       SET "dataRecebimento" = "dataRecebimento" + INTERVAL '3 hours'
     WHERE "dataRecebimento" = date_trunc('day', "dataRecebimento")
    RETURNING "id", "dataRecebimento" AS novo
)
INSERT INTO "backup_datas_sp"."data_antiga" ("rodada", "tabela", "coluna", "id", "valor_antigo", "valor_novo")
SELECT 'varredura-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'), 'Receivable', 'dataRecebimento', "id", novo - INTERVAL '3 hours', novo FROM alterado
ON CONFLICT ("tabela", "coluna", "id", "rodada")
DO UPDATE SET "valor_antigo" = EXCLUDED."valor_antigo", "valor_novo" = EXCLUDED."valor_novo", "revertido_em" = NULL;

-- RecurringTemplate.dataInicio
WITH alterado AS (
    UPDATE "RecurringTemplate"
       SET "dataInicio" = "dataInicio" + INTERVAL '3 hours'
     WHERE "dataInicio" = date_trunc('day', "dataInicio")
    RETURNING "id", "dataInicio" AS novo
)
INSERT INTO "backup_datas_sp"."data_antiga" ("rodada", "tabela", "coluna", "id", "valor_antigo", "valor_novo")
SELECT 'varredura-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'), 'RecurringTemplate', 'dataInicio', "id", novo - INTERVAL '3 hours', novo FROM alterado
ON CONFLICT ("tabela", "coluna", "id", "rodada")
DO UPDATE SET "valor_antigo" = EXCLUDED."valor_antigo", "valor_novo" = EXCLUDED."valor_novo", "revertido_em" = NULL;

-- Purchase.data
-- EXCECAO (so esta coluna): compra criada entre 21:00 e 23:59 de Sao Paulo com o dia PADRAO do formulario. O
-- formulario antigo preenchia o dia com new Date().toISOString().slice(0, 10) = dia UTC = AMANHA nesse horario
-- (a loja funciona ate 23:30). Gravado como 00:00Z, o defeito de -1 dia fazia a tela mostrar o dia certo (o de
-- hoje) POR ACASO; somar +3h faria essas compras passarem a mostrar amanha. Assinatura exata: data em 00:00:00.000,
-- mesmo dia UTC do "createdAt" e "createdAt" entre 00:00 e 02:59:59.999 UTC. Elas recebem o dia de Sao Paulo
-- do "createdAt" as 03:00 (= data - 21h), que e o que a tela mostra hoje; as demais recebem +3h.
-- Quem digitou de proposito o dia de amanha nessa janela e indistinguivel pelo dado: a consulta (6) lista todas.
WITH candidato AS (
    SELECT "id", "data" AS antigo,
           ("data"::date = "createdAt"::date AND EXTRACT(HOUR FROM "createdAt") < 3) AS dia_padrao_utc
      FROM "Purchase"
     WHERE "data" = date_trunc('day', "data")
), alterado AS (
    UPDATE "Purchase" p
       SET "data" = CASE WHEN c.dia_padrao_utc THEN c.antigo - INTERVAL '21 hours' ELSE c.antigo + INTERVAL '3 hours' END
      FROM candidato c
     WHERE p."id" = c."id"
    RETURNING p."id", c.antigo, p."data" AS novo
)
INSERT INTO "backup_datas_sp"."data_antiga" ("rodada", "tabela", "coluna", "id", "valor_antigo", "valor_novo")
SELECT 'varredura-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'), 'Purchase', 'data', "id", antigo, novo FROM alterado
ON CONFLICT ("tabela", "coluna", "id", "rodada")
DO UPDATE SET "valor_antigo" = EXCLUDED."valor_antigo", "valor_novo" = EXCLUDED."valor_novo", "revertido_em" = NULL;

-- Purchase.previsaoEntrega
WITH alterado AS (
    UPDATE "Purchase"
       SET "previsaoEntrega" = "previsaoEntrega" + INTERVAL '3 hours'
     WHERE "previsaoEntrega" = date_trunc('day', "previsaoEntrega")
    RETURNING "id", "previsaoEntrega" AS novo
)
INSERT INTO "backup_datas_sp"."data_antiga" ("rodada", "tabela", "coluna", "id", "valor_antigo", "valor_novo")
SELECT 'varredura-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'), 'Purchase', 'previsaoEntrega', "id", novo - INTERVAL '3 hours', novo FROM alterado
ON CONFLICT ("tabela", "coluna", "id", "rodada")
DO UPDATE SET "valor_antigo" = EXCLUDED."valor_antigo", "valor_novo" = EXCLUDED."valor_novo", "revertido_em" = NULL;

-- Purchase.dataVencimento
WITH alterado AS (
    UPDATE "Purchase"
       SET "dataVencimento" = "dataVencimento" + INTERVAL '3 hours'
     WHERE "dataVencimento" = date_trunc('day', "dataVencimento")
    RETURNING "id", "dataVencimento" AS novo
)
INSERT INTO "backup_datas_sp"."data_antiga" ("rodada", "tabela", "coluna", "id", "valor_antigo", "valor_novo")
SELECT 'varredura-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'), 'Purchase', 'dataVencimento', "id", novo - INTERVAL '3 hours', novo FROM alterado
ON CONFLICT ("tabela", "coluna", "id", "rodada")
DO UPDATE SET "valor_antigo" = EXCLUDED."valor_antigo", "valor_novo" = EXCLUDED."valor_novo", "revertido_em" = NULL;

-- SupplierInvoice.dataCompra
WITH alterado AS (
    UPDATE "SupplierInvoice"
       SET "dataCompra" = "dataCompra" + INTERVAL '3 hours'
     WHERE "dataCompra" = date_trunc('day', "dataCompra")
    RETURNING "id", "dataCompra" AS novo
)
INSERT INTO "backup_datas_sp"."data_antiga" ("rodada", "tabela", "coluna", "id", "valor_antigo", "valor_novo")
SELECT 'varredura-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'), 'SupplierInvoice', 'dataCompra', "id", novo - INTERVAL '3 hours', novo FROM alterado
ON CONFLICT ("tabela", "coluna", "id", "rodada")
DO UPDATE SET "valor_antigo" = EXCLUDED."valor_antigo", "valor_novo" = EXCLUDED."valor_novo", "revertido_em" = NULL;

ANALYZE "backup_datas_sp"."data_antiga";

COMMIT;
