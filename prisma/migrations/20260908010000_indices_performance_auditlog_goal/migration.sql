-- CreateIndex
CREATE INDEX "Goal_empresaId_endDate_idx" ON "Goal"("empresaId", "endDate");

-- CreateIndex
CREATE INDEX "AuditLog_empresaId_createdAt_idx" ON "AuditLog"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

