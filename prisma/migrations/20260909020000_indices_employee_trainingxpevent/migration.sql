-- Employee é filtrado por empresaId em praticamente toda tela de RH (lista de
-- colaboradores, ponto eletrônico) e também via relação (Occurrence.employee.empresaId,
-- usado pelos alertas/indicadores da Tela de Início) sem nenhum índice até agora.
-- CreateIndex
CREATE INDEX "Employee_empresaId_idx" ON "Employee"("empresaId");

-- TrainingXpEvent é buscado por usuário (perfil/gamificação e lista de colaboradores
-- da Universidade, uma consulta por usuário via include) sem nenhum índice até agora.
-- CreateIndex
CREATE INDEX "TrainingXpEvent_userId_idx" ON "TrainingXpEvent"("userId");
