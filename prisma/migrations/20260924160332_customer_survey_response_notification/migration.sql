-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "customerSurveyResponseId" TEXT;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerSurveyResponseId_fkey" FOREIGN KEY ("customerSurveyResponseId") REFERENCES "CustomerSurveyResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
