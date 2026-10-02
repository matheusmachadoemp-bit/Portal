-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "responsavelEmployeeId" TEXT;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_responsavelEmployeeId_fkey" FOREIGN KEY ("responsavelEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
