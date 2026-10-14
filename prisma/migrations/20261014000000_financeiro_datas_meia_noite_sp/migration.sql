-- Financeiro e Estoque: ancora as DATAS (dia, sem hora) na meia-noite de SAO PAULO (03:00 UTC), a mesma
-- convencao do resto do Portal (spStartOfDay em src/lib/timezone.ts: Conciliacao, Ponto, Folgas, Ausencias...).
-- Mesmo molde da migration 20260923130000_time_entry_date_fuso_horario_backfill (Ponto), com backup.
--
-- Por que: as rotas de Contas a Pagar, Contas a Receber, Contas Recorrentes e Compras (Estoque) gravavam
-- `new Date("AAAA-MM-DD")` cru = meia-noite UTC = 21:00 do dia ANTERIOR em Sao Paulo. A tela (que formata no
-- fuso do navegador) mostrava o dia anterior ao digitado (25/10 digitado -> 24/10 na lista) e os filtros
-- ancorados em Sao Paulo (Fluxo de Caixa, periodo de Compras) erravam o dia. O codigo novo grava
-- `spStartOfDay("AAAA-MM-DD")` (03:00 UTC). Esta migration alinha os dados ANTIGOS.
--
-- O que faz: soma EXATAS 3 horas, e somente, nas celulas que estao EXATAMENTE em 00:00:00.000 (convencao antiga).
-- 00:00 + 3h = 03:00 do MESMO dia calendario: o dia gravado nunca muda; muda so a hora (e, por consequencia, o
-- dia que a tela mostra em Sao Paulo: passa a ser o dia gravado, em vez do dia anterior).
-- UNICA excecao: Purchase.data de compra criada entre 21:00 e 23:59 de Sao Paulo com o dia padrao do formulario
-- (dia UTC = amanha); ver o comentario no bloco "Purchase.data". Nesse caso o dia muda para o dia de Sao Paulo
-- da criacao (data - 21h), exatamente o que a tela mostra hoje.
-- Celulas com qualquer outra hora (hora real, ou ja 03:00) e nulos NAO sao tocados. Colunas:
-- Payable.dataCompetencia/dataVencimento/dataPagamento; Receivable.dataCompetencia/dataVencimento/dataRecebimento;
-- RecurringTemplate.dataInicio; Purchase.data/previsaoEntrega/dataVencimento; SupplierInvoice.dataCompra (copia
-- da competencia do boleto).
--
-- Rede de seguranca: cada celula alterada e registrada em "backup_datas_sp"."data_antiga" (valor antigo e novo),
-- NA MESMA instrucao do UPDATE (CTE com RETURNING), entao o backup e exatamente o que foi alterado. Fica num
-- schema proprio para nao aparecer como "diferenca" no schema.prisma (prisma migrate diff continua vazio).
-- Reversao: scripts/reverter-datas-meia-noite-sp.sql (so desfaz o que nao foi editado depois; roda 2x sem dano).
-- Varredura (pegar linhas que o codigo ANTIGO tenha gravado depois): scripts/varredura-datas-meia-noite-sp.sql.
--
-- Idempotente: depois da primeira execucao nenhuma celula sobra no filtro "exatamente 00:00:00.000".
-- Nesta migration "valor_antigo" e lido ANTES do UPDATE (nao e mais "novo - 3h"): a excecao acima soma -21h.
-- Nao mexe em "updatedAt" (gerido pelo Prisma, nao por trigger) nem em AuditLog.
--
-- BEGIN/COMMIT explicitos: o Prisma NAO envolve o arquivo numa transacao (testado: se uma instrucao do meio
-- falha, as anteriores ficam gravadas e a migration fica "falha", travando os proximos deploys com P3009). Com a
-- transacao explicita, ou tudo e aplicado ou nada e. (Nao ha precedente de transacao explicita no nivel
-- superior em prisma/migrations: os BEGIN existentes sao de blocos DO $$ ... $$.)
--
-- NUNCA editar este arquivo depois de aplicada (checksum do Prisma). Remover o backup (DROP SCHEMA
-- backup_datas_sp CASCADE) so numa migration futura aprovada pelo dono, ~30 dias depois.

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
SELECT '20261014000000_financeiro_datas_meia_noite_sp', 'Payable', 'dataCompetencia', "id", novo - INTERVAL '3 hours', novo FROM alterado
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
SELECT '20261014000000_financeiro_datas_meia_noite_sp', 'Payable', 'dataVencimento', "id", novo - INTERVAL '3 hours', novo FROM alterado
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
SELECT '20261014000000_financeiro_datas_meia_noite_sp', 'Payable', 'dataPagamento', "id", novo - INTERVAL '3 hours', novo FROM alterado
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
SELECT '20261014000000_financeiro_datas_meia_noite_sp', 'Receivable', 'dataCompetencia', "id", novo - INTERVAL '3 hours', novo FROM alterado
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
SELECT '20261014000000_financeiro_datas_meia_noite_sp', 'Receivable', 'dataVencimento', "id", novo - INTERVAL '3 hours', novo FROM alterado
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
SELECT '20261014000000_financeiro_datas_meia_noite_sp', 'Receivable', 'dataRecebimento', "id", novo - INTERVAL '3 hours', novo FROM alterado
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
SELECT '20261014000000_financeiro_datas_meia_noite_sp', 'RecurringTemplate', 'dataInicio', "id", novo - INTERVAL '3 hours', novo FROM alterado
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
SELECT '20261014000000_financeiro_datas_meia_noite_sp', 'Purchase', 'data', "id", antigo, novo FROM alterado
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
SELECT '20261014000000_financeiro_datas_meia_noite_sp', 'Purchase', 'previsaoEntrega', "id", novo - INTERVAL '3 hours', novo FROM alterado
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
SELECT '20261014000000_financeiro_datas_meia_noite_sp', 'Purchase', 'dataVencimento', "id", novo - INTERVAL '3 hours', novo FROM alterado
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
SELECT '20261014000000_financeiro_datas_meia_noite_sp', 'SupplierInvoice', 'dataCompra', "id", novo - INTERVAL '3 hours', novo FROM alterado
ON CONFLICT ("tabela", "coluna", "id", "rodada")
DO UPDATE SET "valor_antigo" = EXCLUDED."valor_antigo", "valor_novo" = EXCLUDED."valor_novo", "revertido_em" = NULL;

ANALYZE "backup_datas_sp"."data_antiga";

COMMIT;
