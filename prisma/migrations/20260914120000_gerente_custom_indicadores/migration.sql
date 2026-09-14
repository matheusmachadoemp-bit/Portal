-- CreateEnum
CREATE TYPE "GerenteIndicatorUnit" AS ENUM ('PERCENT', 'CURRENCY', 'NUMBER');

-- CreateEnum
CREATE TYPE "GerenteIndicatorDirection" AS ENUM ('MIN', 'MAX');

-- CreateTable
CREATE TABLE "GerenteCustomIndicator" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Target',
    "unidade" "GerenteIndicatorUnit" NOT NULL DEFAULT 'PERCENT',
    "direcao" "GerenteIndicatorDirection" NOT NULL DEFAULT 'MIN',
    "metaPadrao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoPadrao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GerenteCustomIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GerenteCustomIndicatorValue" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "valor" DOUBLE PRECISION,
    "metaValue" DOUBLE PRECISION NOT NULL,
    "premiacaoValor" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GerenteCustomIndicatorValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GerenteCustomIndicator_empresaId_idx" ON "GerenteCustomIndicator"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "GerenteCustomIndicatorValue_indicatorId_periodo_key" ON "GerenteCustomIndicatorValue"("indicatorId", "periodo");

-- AddForeignKey
ALTER TABLE "GerenteCustomIndicator" ADD CONSTRAINT "GerenteCustomIndicator_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GerenteCustomIndicator" ADD CONSTRAINT "GerenteCustomIndicator_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GerenteCustomIndicatorValue" ADD CONSTRAINT "GerenteCustomIndicatorValue_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "GerenteCustomIndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
