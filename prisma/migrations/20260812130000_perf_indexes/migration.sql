-- CreateIndex
CREATE INDEX "SalesEntry_empresaId_date_idx" ON "SalesEntry"("empresaId", "date");

-- CreateIndex
CREATE INDEX "Payable_empresaId_status_dataVencimento_idx" ON "Payable"("empresaId", "status", "dataVencimento");

-- CreateIndex
CREATE INDEX "Payable_empresaId_dataCompetencia_idx" ON "Payable"("empresaId", "dataCompetencia");

-- CreateIndex
CREATE INDEX "Receivable_empresaId_status_dataVencimento_idx" ON "Receivable"("empresaId", "status", "dataVencimento");

-- CreateIndex
CREATE INDEX "Receivable_empresaId_dataCompetencia_idx" ON "Receivable"("empresaId", "dataCompetencia");
