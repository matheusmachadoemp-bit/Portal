-- AlterTable
ALTER TABLE "Chamado" ADD COLUMN     "atrasoNotificadoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Chamado_prazo_idx" ON "Chamado"("prazo");
