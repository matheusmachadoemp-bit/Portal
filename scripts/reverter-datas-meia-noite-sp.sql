-- REVERSAO da migration 20261014000000_financeiro_datas_meia_noite_sp (e de qualquer "varredura" feita depois).
-- Devolve cada data ao valor ANTIGO (meia-noite UTC) registrado em "backup_datas_sp"."data_antiga".
--
-- ATENCAO (leia antes): este arquivo desfaz SO os DADOS (devolve a meia-noite UTC, 00:00Z).
--   * Com o codigo NOVO no ar, reverter os dados traz o defeito de volta nas contas revertidas: a lista passa a
--     mostrar 1 dia ANTES do digitado.
--   * Voltar so o CODIGO (rollback da Vercel) com os dados ja em 03:00Z NAO e totalmente seguro: as telas seguem
--     mostrando o dia certo, mas (a) o filtro "Personalizado" de Pagar e Receber erra (dia X a X nao acha nada) e
--     (b) toda data que o codigo antigo gravar (conta nova, data alterada, "Marcar como pago" e, no Receber,
--     qualquer salvamento) volta a ser 00:00Z (1 dia antes na tela; no Receber, o recuo a cada
--     salvamento volta). Depois de um rollback de codigo, rode scripts/varredura-datas-meia-noite-sp.sql para
--     reancorar o que o codigo antigo gravou.
--   * Em duvida, prefira CORRIGIR PARA FRENTE (publicar de novo o codigo corrigido) a reverter. Fale com quem
--     mantem o sistema antes de rodar este arquivo.
--
-- So reverte a celula que AINDA esta com o valor que a correcao gravou (valor_novo). Se alguem editou aquela
-- data depois, o valor novo foi digitado de proposito e NAO e sobrescrito: a celula fica com "revertido_em"
-- vazio no backup e aparece no relatorio do final como "ficaram".
-- Cada celula revertida e marcada em "revertido_em" (o registro NAO e apagado), entao:
--   * rodar a reversao duas vezes nao faz mal (na segunda, nada bate e nada muda);
--   * da para aplicar a correcao de novo depois (scripts/varredura-datas-meia-noite-sp.sql) sem conflito.
-- Nao mexe em "updatedAt" nem em AuditLog. Tudo numa transacao: ou reverte tudo ou nada.

BEGIN;

-- Payable.dataCompetencia
WITH revertido AS (
    UPDATE "Payable" t SET "dataCompetencia" = b."valor_antigo"
      FROM "backup_datas_sp"."data_antiga" b
     WHERE b."revertido_em" IS NULL AND b."tabela" = 'Payable' AND b."coluna" = 'dataCompetencia'
       AND b."id" = t."id" AND t."dataCompetencia" = b."valor_novo"
    RETURNING t."id"
)
UPDATE "backup_datas_sp"."data_antiga" SET "revertido_em" = CURRENT_TIMESTAMP
 WHERE "revertido_em" IS NULL AND "tabela" = 'Payable' AND "coluna" = 'dataCompetencia' AND "id" IN (SELECT "id" FROM revertido);

-- Payable.dataVencimento
WITH revertido AS (
    UPDATE "Payable" t SET "dataVencimento" = b."valor_antigo"
      FROM "backup_datas_sp"."data_antiga" b
     WHERE b."revertido_em" IS NULL AND b."tabela" = 'Payable' AND b."coluna" = 'dataVencimento'
       AND b."id" = t."id" AND t."dataVencimento" = b."valor_novo"
    RETURNING t."id"
)
UPDATE "backup_datas_sp"."data_antiga" SET "revertido_em" = CURRENT_TIMESTAMP
 WHERE "revertido_em" IS NULL AND "tabela" = 'Payable' AND "coluna" = 'dataVencimento' AND "id" IN (SELECT "id" FROM revertido);

-- Payable.dataPagamento
WITH revertido AS (
    UPDATE "Payable" t SET "dataPagamento" = b."valor_antigo"
      FROM "backup_datas_sp"."data_antiga" b
     WHERE b."revertido_em" IS NULL AND b."tabela" = 'Payable' AND b."coluna" = 'dataPagamento'
       AND b."id" = t."id" AND t."dataPagamento" = b."valor_novo"
    RETURNING t."id"
)
UPDATE "backup_datas_sp"."data_antiga" SET "revertido_em" = CURRENT_TIMESTAMP
 WHERE "revertido_em" IS NULL AND "tabela" = 'Payable' AND "coluna" = 'dataPagamento' AND "id" IN (SELECT "id" FROM revertido);

-- Receivable.dataCompetencia
WITH revertido AS (
    UPDATE "Receivable" t SET "dataCompetencia" = b."valor_antigo"
      FROM "backup_datas_sp"."data_antiga" b
     WHERE b."revertido_em" IS NULL AND b."tabela" = 'Receivable' AND b."coluna" = 'dataCompetencia'
       AND b."id" = t."id" AND t."dataCompetencia" = b."valor_novo"
    RETURNING t."id"
)
UPDATE "backup_datas_sp"."data_antiga" SET "revertido_em" = CURRENT_TIMESTAMP
 WHERE "revertido_em" IS NULL AND "tabela" = 'Receivable' AND "coluna" = 'dataCompetencia' AND "id" IN (SELECT "id" FROM revertido);

-- Receivable.dataVencimento
WITH revertido AS (
    UPDATE "Receivable" t SET "dataVencimento" = b."valor_antigo"
      FROM "backup_datas_sp"."data_antiga" b
     WHERE b."revertido_em" IS NULL AND b."tabela" = 'Receivable' AND b."coluna" = 'dataVencimento'
       AND b."id" = t."id" AND t."dataVencimento" = b."valor_novo"
    RETURNING t."id"
)
UPDATE "backup_datas_sp"."data_antiga" SET "revertido_em" = CURRENT_TIMESTAMP
 WHERE "revertido_em" IS NULL AND "tabela" = 'Receivable' AND "coluna" = 'dataVencimento' AND "id" IN (SELECT "id" FROM revertido);

-- Receivable.dataRecebimento
WITH revertido AS (
    UPDATE "Receivable" t SET "dataRecebimento" = b."valor_antigo"
      FROM "backup_datas_sp"."data_antiga" b
     WHERE b."revertido_em" IS NULL AND b."tabela" = 'Receivable' AND b."coluna" = 'dataRecebimento'
       AND b."id" = t."id" AND t."dataRecebimento" = b."valor_novo"
    RETURNING t."id"
)
UPDATE "backup_datas_sp"."data_antiga" SET "revertido_em" = CURRENT_TIMESTAMP
 WHERE "revertido_em" IS NULL AND "tabela" = 'Receivable' AND "coluna" = 'dataRecebimento' AND "id" IN (SELECT "id" FROM revertido);

-- RecurringTemplate.dataInicio
WITH revertido AS (
    UPDATE "RecurringTemplate" t SET "dataInicio" = b."valor_antigo"
      FROM "backup_datas_sp"."data_antiga" b
     WHERE b."revertido_em" IS NULL AND b."tabela" = 'RecurringTemplate' AND b."coluna" = 'dataInicio'
       AND b."id" = t."id" AND t."dataInicio" = b."valor_novo"
    RETURNING t."id"
)
UPDATE "backup_datas_sp"."data_antiga" SET "revertido_em" = CURRENT_TIMESTAMP
 WHERE "revertido_em" IS NULL AND "tabela" = 'RecurringTemplate' AND "coluna" = 'dataInicio' AND "id" IN (SELECT "id" FROM revertido);

-- Purchase.data
WITH revertido AS (
    UPDATE "Purchase" t SET "data" = b."valor_antigo"
      FROM "backup_datas_sp"."data_antiga" b
     WHERE b."revertido_em" IS NULL AND b."tabela" = 'Purchase' AND b."coluna" = 'data'
       AND b."id" = t."id" AND t."data" = b."valor_novo"
    RETURNING t."id"
)
UPDATE "backup_datas_sp"."data_antiga" SET "revertido_em" = CURRENT_TIMESTAMP
 WHERE "revertido_em" IS NULL AND "tabela" = 'Purchase' AND "coluna" = 'data' AND "id" IN (SELECT "id" FROM revertido);

-- Purchase.previsaoEntrega
WITH revertido AS (
    UPDATE "Purchase" t SET "previsaoEntrega" = b."valor_antigo"
      FROM "backup_datas_sp"."data_antiga" b
     WHERE b."revertido_em" IS NULL AND b."tabela" = 'Purchase' AND b."coluna" = 'previsaoEntrega'
       AND b."id" = t."id" AND t."previsaoEntrega" = b."valor_novo"
    RETURNING t."id"
)
UPDATE "backup_datas_sp"."data_antiga" SET "revertido_em" = CURRENT_TIMESTAMP
 WHERE "revertido_em" IS NULL AND "tabela" = 'Purchase' AND "coluna" = 'previsaoEntrega' AND "id" IN (SELECT "id" FROM revertido);

-- Purchase.dataVencimento
WITH revertido AS (
    UPDATE "Purchase" t SET "dataVencimento" = b."valor_antigo"
      FROM "backup_datas_sp"."data_antiga" b
     WHERE b."revertido_em" IS NULL AND b."tabela" = 'Purchase' AND b."coluna" = 'dataVencimento'
       AND b."id" = t."id" AND t."dataVencimento" = b."valor_novo"
    RETURNING t."id"
)
UPDATE "backup_datas_sp"."data_antiga" SET "revertido_em" = CURRENT_TIMESTAMP
 WHERE "revertido_em" IS NULL AND "tabela" = 'Purchase' AND "coluna" = 'dataVencimento' AND "id" IN (SELECT "id" FROM revertido);

-- SupplierInvoice.dataCompra
WITH revertido AS (
    UPDATE "SupplierInvoice" t SET "dataCompra" = b."valor_antigo"
      FROM "backup_datas_sp"."data_antiga" b
     WHERE b."revertido_em" IS NULL AND b."tabela" = 'SupplierInvoice' AND b."coluna" = 'dataCompra'
       AND b."id" = t."id" AND t."dataCompra" = b."valor_novo"
    RETURNING t."id"
)
UPDATE "backup_datas_sp"."data_antiga" SET "revertido_em" = CURRENT_TIMESTAMP
 WHERE "revertido_em" IS NULL AND "tabela" = 'SupplierInvoice' AND "coluna" = 'dataCompra' AND "id" IN (SELECT "id" FROM revertido);

COMMIT;

-- Relatorio (somente leitura): por rodada/tabela/coluna, quantas celulas foram revertidas e quantas ficaram
-- (editadas depois da correcao). Logo apos a migration, "ficaram" deve ser 0 (ou so as que alguem editou).
SELECT "rodada", "tabela", "coluna",
       count(*) AS celulas_no_backup,
       count(*) FILTER (WHERE "revertido_em" IS NOT NULL) AS revertidas,
       count(*) FILTER (WHERE "revertido_em" IS NULL) AS ficaram
  FROM "backup_datas_sp"."data_antiga"
 GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
