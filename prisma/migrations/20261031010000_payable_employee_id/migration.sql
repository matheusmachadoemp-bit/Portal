-- AlterTable
ALTER TABLE "Payable" ADD COLUMN     "employeeId" TEXT;

-- CreateIndex
CREATE INDEX "Payable_employeeId_idx" ON "Payable"("employeeId");

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

