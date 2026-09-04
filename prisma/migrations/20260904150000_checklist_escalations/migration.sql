
-- CreateEnum
CREATE TYPE "ChecklistEscalationType" AS ENUM ('AVISO_ANTES', 'NO_LIMITE', 'ATRASO_RESPONSAVEL', 'ALERTA_CRITICO', 'NAO_REALIZADO');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('INFORMACAO', 'ATENCAO', 'CRITICA');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "checklistOccurrenceId" TEXT,
ADD COLUMN     "priority" "NotificationPriority";

-- CreateTable
CREATE TABLE "ChecklistEscalationLog" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "tipo" "ChecklistEscalationType" NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistEscalationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistEscalationLog_occurrenceId_idx" ON "ChecklistEscalationLog"("occurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistEscalationLog_occurrenceId_tipo_destinatarioId_key" ON "ChecklistEscalationLog"("occurrenceId", "tipo", "destinatarioId");

-- AddForeignKey
ALTER TABLE "ChecklistEscalationLog" ADD CONSTRAINT "ChecklistEscalationLog_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ChecklistOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistEscalationLog" ADD CONSTRAINT "ChecklistEscalationLog_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_checklistOccurrenceId_fkey" FOREIGN KEY ("checklistOccurrenceId") REFERENCES "ChecklistOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

