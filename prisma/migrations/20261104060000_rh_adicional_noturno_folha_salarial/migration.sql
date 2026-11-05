-- CreateEnum
CREATE TYPE "NightShiftAllowanceStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "divisorContratual" INTEGER DEFAULT 220,
ADD COLUMN     "horarioContratualEntrada" TEXT,
ADD COLUMN     "horarioContratualSaida" TEXT;

-- CreateTable
CREATE TABLE "NightShiftAllowance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "competenciaMes" INTEGER NOT NULL,
    "competenciaAno" INTEGER NOT NULL,
    "horasNoturnasReais" DOUBLE PRECISION NOT NULL,
    "horasNoturnasConvertidas" DOUBLE PRECISION NOT NULL,
    "valorAdicional" DOUBLE PRECISION NOT NULL,
    "status" "NightShiftAllowanceStatus" NOT NULL DEFAULT 'PENDENTE',
    "aprovadoPorId" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NightShiftAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NightShiftAllowance_empresaId_competenciaAno_competenciaMes_idx" ON "NightShiftAllowance"("empresaId", "competenciaAno", "competenciaMes");

-- CreateIndex
CREATE UNIQUE INDEX "NightShiftAllowance_employeeId_competenciaMes_competenciaAn_key" ON "NightShiftAllowance"("employeeId", "competenciaMes", "competenciaAno");

-- AddForeignKey
ALTER TABLE "NightShiftAllowance" ADD CONSTRAINT "NightShiftAllowance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NightShiftAllowance" ADD CONSTRAINT "NightShiftAllowance_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NightShiftAllowance" ADD CONSTRAINT "NightShiftAllowance_aprovadoPorId_fkey" FOREIGN KEY ("aprovadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
