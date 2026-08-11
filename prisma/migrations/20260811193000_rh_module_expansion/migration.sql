-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'ADVERTENCIA';

-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'SUSPENSAO';

-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'ELOGIO';

-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'ACIDENTE';

-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'RECLAMACAO';

-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'CONFLITO_INTERNO';

-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'FEEDBACK';

-- CreateEnum
CREATE TYPE "RhFinanceType" AS ENUM ('SALARIO', 'COMISSAO', 'BONIFICACAO', 'DESCONTO', 'VALE_TRANSPORTE', 'VALE_ALIMENTACAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "VacationStatus" AS ENUM ('PLANEJADA', 'APROVADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "UniformItemType" AS ENUM ('CAMISA', 'CALCA', 'AVENTAL', 'BONE', 'TOUCA', 'SAPATO', 'CINTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "UniformStatus" AS ENUM ('ENTREGUE', 'TROCADO', 'DEVOLVIDO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('RG', 'CPF', 'CTPS', 'COMPROVANTE_RESIDENCIA', 'TITULO_ELEITOR', 'RESERVISTA', 'EXAME_ADMISSIONAL', 'ASO', 'CNH', 'CONTRATO', 'TERMO', 'CERTIFICADO', 'TREINAMENTO', 'OUTRO');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "escala" TEXT,
ADD COLUMN     "supervisorResponsavel" TEXT,
ADD COLUMN     "salarioFixo" DOUBLE PRECISION,
ADD COLUMN     "lastEvaluationDate" TIMESTAMP(3),
ADD COLUMN     "lastEvaluationNote" TEXT,
ADD COLUMN     "lastTrainingDate" TIMESTAMP(3),
ADD COLUMN     "lastTrainingName" TEXT;

-- AlterTable
ALTER TABLE "Occurrence" ADD COLUMN     "medidasTomadas" TEXT,
ADD COLUMN     "prazo" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmployeeFinanceEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "type" "RhFinanceType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeFinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "entrada" TEXT,
    "saidaAlmoco" TEXT,
    "retornoAlmoco" TEXT,
    "saida" TEXT,
    "horasTrabalhadas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "atrasoMinutos" INTEGER NOT NULL DEFAULT 0,
    "falta" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vacation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodoAquisitivoInicio" TIMESTAMP(3) NOT NULL,
    "periodoAquisitivoFim" TIMESTAMP(3) NOT NULL,
    "diasDireito" INTEGER NOT NULL DEFAULT 30,
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "dias" INTEGER,
    "status" "VacationStatus" NOT NULL DEFAULT 'PLANEJADA',
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vacation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniformDelivery" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "item" "UniformItemType" NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "tamanho" TEXT,
    "dataEntrega" TIMESTAMP(3) NOT NULL,
    "responsavel" TEXT,
    "status" "UniformStatus" NOT NULL DEFAULT 'ENTREGUE',
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UniformDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "categoria" "DocumentCategory" NOT NULL,
    "nome" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "validade" TIMESTAMP(3),
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeFinanceEntry_employeeId_idx" ON "EmployeeFinanceEntry"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_employeeId_date_key" ON "TimeEntry"("employeeId", "date");

-- CreateIndex
CREATE INDEX "Vacation_employeeId_idx" ON "Vacation"("employeeId");

-- CreateIndex
CREATE INDEX "UniformDelivery_employeeId_idx" ON "UniformDelivery"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDocument_employeeId_idx" ON "EmployeeDocument"("employeeId");

-- AddForeignKey
ALTER TABLE "EmployeeFinanceEntry" ADD CONSTRAINT "EmployeeFinanceEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeFinanceEntry" ADD CONSTRAINT "EmployeeFinanceEntry_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeFinanceEntry" ADD CONSTRAINT "EmployeeFinanceEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacation" ADD CONSTRAINT "Vacation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacation" ADD CONSTRAINT "Vacation_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacation" ADD CONSTRAINT "Vacation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformDelivery" ADD CONSTRAINT "UniformDelivery_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformDelivery" ADD CONSTRAINT "UniformDelivery_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformDelivery" ADD CONSTRAINT "UniformDelivery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
