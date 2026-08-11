-- AlterEnum
ALTER TYPE "GoalCategory" ADD VALUE 'MARKETING';
ALTER TYPE "GoalCategory" ADD VALUE 'ADMINISTRATIVO';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "photoUrl" TEXT;

-- CreateTable
CREATE TABLE "WaiterSaleEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaiterSaleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaiterSaleEntry_employeeId_idx" ON "WaiterSaleEntry"("employeeId");

-- AddForeignKey
ALTER TABLE "WaiterSaleEntry" ADD CONSTRAINT "WaiterSaleEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiterSaleEntry" ADD CONSTRAINT "WaiterSaleEntry_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiterSaleEntry" ADD CONSTRAINT "WaiterSaleEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
