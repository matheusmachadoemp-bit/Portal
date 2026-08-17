-- Índices ausentes em modelos de RH que já são filtrados/ordenados por
-- empresaId (e, no caso de Occurrence, por employeeId+date) nas rotas de
-- API, mas não tinham índice correspondente.

-- CreateIndex
CREATE INDEX "Occurrence_employeeId_date_idx" ON "Occurrence"("employeeId", "date");

-- CreateIndex
CREATE INDEX "EmployeeFinanceEntry_empresaId_date_idx" ON "EmployeeFinanceEntry"("empresaId", "date");

-- CreateIndex
CREATE INDEX "Vacation_empresaId_periodoAquisitivoInicio_idx" ON "Vacation"("empresaId", "periodoAquisitivoInicio");

-- CreateIndex
CREATE INDEX "UniformDelivery_empresaId_dataEntrega_idx" ON "UniformDelivery"("empresaId", "dataEntrega");

-- CreateIndex
CREATE INDEX "EmployeeDocument_empresaId_createdAt_idx" ON "EmployeeDocument"("empresaId", "createdAt");
