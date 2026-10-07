-- "YYYY-MM-DD" da última geração automática de contagem desta agenda (reivindicação atômica,
-- mesmo padrão de `ultimoLembreteData`). `IF NOT EXISTS`: segura mesmo em banco onde a coluna já
-- exista (ex.: ambiente de teste).
ALTER TABLE "StockCountSchedule" ADD COLUMN IF NOT EXISTS "ultimaGeracaoData" TEXT;
