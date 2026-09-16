-- Garante idempotência do upsert de `Sale` a partir da sincronização
-- automática da Saipos (ver src/lib/saipos-sync.ts): sem essa constraint,
-- rodar o sync duas vezes para o mesmo intervalo poderia criar vendas
-- duplicadas em `Sale` (a checagem de "já existe" feita na aplicação não
-- é atômica). Vendas manuais/importadas continuam com `saiposSaleId = NULL`,
-- e o Postgres não aplica unicidade entre múltiplos NULLs, então não há
-- conflito entre elas.
CREATE UNIQUE INDEX "Sale_empresaId_saiposSaleId_key" ON "Sale"("empresaId", "saiposSaleId");
