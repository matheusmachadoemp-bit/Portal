-- CreateEnum
CREATE TYPE "ProductionItemType" AS ENUM ('FIXO', 'VARIAVEL');

-- CreateEnum
CREATE TYPE "ProductionStockMovementType" AS ENUM ('PRODUCAO', 'SALDO_ANTERIOR', 'AJUSTE', 'PERDA');

-- CreateEnum
CREATE TYPE "ProductionPriority" AS ENUM ('URGENTE', 'ALTA', 'NORMAL', 'BAIXA');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('PENDENTE', 'EM_PRODUCAO', 'CONCLUIDO', 'ATRASADO');

-- CreateEnum
CREATE TYPE "ProductionAjusteMotivo" AS ENUM ('EVENTO', 'RESERVA', 'PROMOCAO', 'EXPECTATIVA_MOVIMENTO', 'ESTOQUE', 'FERIADO', 'OUTRO');

-- CreateTable
CREATE TABLE "ProductionCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2952E3',
    "icon" TEXT NOT NULL DEFAULT 'ChefHat',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionItem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT 'kg',
    "fotoUrl" TEXT,
    "descricao" TEXT,
    "tipo" "ProductionItemType" NOT NULL DEFAULT 'VARIAVEL',
    "quantidadeMinima" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "margemSeguranca" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tamanhoLote" DOUBLE PRECISION,
    "validadeDias" INTEGER,
    "horarioLimitePadrao" TEXT,
    "prioridadePadrao" "ProductionPriority" NOT NULL DEFAULT 'NORMAL',
    "ingredientId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionItemIngredient" (
    "id" TEXT NOT NULL,
    "productionItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantidadeUsada" DOUBLE PRECISION NOT NULL,
    "unidade" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductionItemIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionStock" (
    "id" TEXT NOT NULL,
    "productionItemId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "saldoAtual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionStockMovement" (
    "id" TEXT NOT NULL,
    "productionItemId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "type" "ProductionStockMovementType" NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "saldoApos" DOUBLE PRECISION NOT NULL,
    "orderId" TEXT,
    "motivo" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "productionItemId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "necessidadePrevista" DOUBLE PRECISION NOT NULL,
    "estoqueProntoSnapshot" DOUBLE PRECISION NOT NULL,
    "quantidadeSugerida" DOUBLE PRECISION NOT NULL,
    "quantidadeAprovada" DOUBLE PRECISION,
    "quantidadeProduzida" DOUBLE PRECISION,
    "forecastId" TEXT,
    "responsavelId" TEXT,
    "prazo" TIMESTAMP(3) NOT NULL,
    "prioridade" "ProductionPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'PENDENTE',
    "horaInicio" TIMESTAMP(3),
    "horaFim" TIMESTAMP(3),
    "observacao" TEXT,
    "fotoUrl" TEXT,
    "validade" TIMESTAMP(3),
    "ajusteMotivo" "ProductionAjusteMotivo",
    "ajusteValorOriginal" DOUBLE PRECISION,
    "ajusteValorAlterado" DOUBLE PRECISION,
    "ajustePorId" TEXT,
    "ajusteEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrderHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionOrderHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionForecast" (
    "id" TEXT NOT NULL,
    "productionItemId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "weekday" INTEGER NOT NULL,
    "weekdayWeightUsed" DOUBLE PRECISION NOT NULL,
    "weeksUsed" TEXT NOT NULL,
    "mediaSemanal" DOUBLE PRECISION NOT NULL,
    "resultingQuantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionWeekdayWeight" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionWeekdayWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionSettings" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "semanasParaMedia" INTEGER NOT NULL DEFAULT 4,
    "toleranciaAlertaPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionCategory_key_key" ON "ProductionCategory"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionItem_ingredientId_key" ON "ProductionItem"("ingredientId");

-- CreateIndex
CREATE INDEX "ProductionItem_empresaId_active_idx" ON "ProductionItem"("empresaId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionStock_productionItemId_key" ON "ProductionStock"("productionItemId");

-- CreateIndex
CREATE INDEX "ProductionStockMovement_productionItemId_createdAt_idx" ON "ProductionStockMovement"("productionItemId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionStockMovement_empresaId_createdAt_idx" ON "ProductionStockMovement"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionOrder_empresaId_date_status_idx" ON "ProductionOrder"("empresaId", "date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_productionItemId_empresaId_date_key" ON "ProductionOrder"("productionItemId", "empresaId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionForecast_productionItemId_empresaId_targetDate_key" ON "ProductionForecast"("productionItemId", "empresaId", "targetDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionWeekdayWeight_empresaId_weekday_key" ON "ProductionWeekdayWeight"("empresaId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionSettings_empresaId_key" ON "ProductionSettings"("empresaId");

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductionCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionItemIngredient" ADD CONSTRAINT "ProductionItemIngredient_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionItemIngredient" ADD CONSTRAINT "ProductionItemIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionStock" ADD CONSTRAINT "ProductionStock_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionStock" ADD CONSTRAINT "ProductionStock_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionStockMovement" ADD CONSTRAINT "ProductionStockMovement_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionStockMovement" ADD CONSTRAINT "ProductionStockMovement_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionStockMovement" ADD CONSTRAINT "ProductionStockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionStockMovement" ADD CONSTRAINT "ProductionStockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "ProductionForecast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_ajustePorId_fkey" FOREIGN KEY ("ajustePorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderHistory" ADD CONSTRAINT "ProductionOrderHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderHistory" ADD CONSTRAINT "ProductionOrderHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionForecast" ADD CONSTRAINT "ProductionForecast_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionForecast" ADD CONSTRAINT "ProductionForecast_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionWeekdayWeight" ADD CONSTRAINT "ProductionWeekdayWeight_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionSettings" ADD CONSTRAINT "ProductionSettings_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
