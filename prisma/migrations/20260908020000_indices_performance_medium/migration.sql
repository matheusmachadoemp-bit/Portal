-- CreateIndex
CREATE INDEX "MarketingTask_empresaId_date_idx" ON "MarketingTask"("empresaId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_empresaId_date_idx" ON "TimeEntry"("empresaId", "date");

-- CreateIndex
CREATE INDEX "TaskHistory_taskId_idx" ON "TaskHistory"("taskId");

