-- CreateEnum
CREATE TYPE "LojaNordRewardCategory" AS ENUM ('EXPERIENCIAS', 'FOLGAS_BENEFICIOS', 'BEBIDAS', 'ELETRONICOS', 'PRODUTOS_NORD', 'VALE_CONSUMO');

-- CreateEnum
CREATE TYPE "LojaNordTransactionKind" AS ENUM ('GANHO', 'BONIFICACAO', 'RESGATE', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'ESTORNO', 'EXPIRACAO');

-- CreateEnum
CREATE TYPE "LojaNordRedemptionStatus" AS ENUM ('AGUARDANDO_APROVACAO', 'APROVADO', 'DISPONIVEL_RETIRADA', 'ENTREGUE', 'RECUSADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "LojaNordPointRule" (
    "id" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "pontos" INTEGER NOT NULL,
    "limiteDiario" INTEGER,
    "limiteMensal" INTEGER,
    "exigeValidacao" BOOLEAN NOT NULL DEFAULT false,
    "setores" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "empresaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "validoDe" TIMESTAMP(3),
    "validoAte" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LojaNordPointRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LojaNordReward" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" "LojaNordRewardCategory" NOT NULL,
    "imagemUrl" TEXT,
    "pontos" INTEGER NOT NULL,
    "estoque" INTEGER,
    "estoqueMinimo" INTEGER,
    "limitePorColaborador" INTEGER,
    "disponivelDe" TIMESTAMP(3),
    "disponivelAte" TIMESTAMP(3),
    "empresaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exigeAprovacao" BOOLEAN NOT NULL DEFAULT true,
    "regras" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LojaNordReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LojaNordRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "pontos" INTEGER NOT NULL,
    "status" "LojaNordRedemptionStatus" NOT NULL DEFAULT 'AGUARDANDO_APROVACAO',
    "dataPrevista" TIMESTAMP(3),
    "aprovadoPorId" TEXT,
    "motivoRecusa" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LojaNordRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LojaNordPointTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "kind" "LojaNordTransactionKind" NOT NULL,
    "pontos" INTEGER NOT NULL,
    "origem" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "setor" TEXT,
    "ruleId" TEXT,
    "redemptionId" TEXT,
    "criadoPorId" TEXT,
    "justificativa" TEXT,
    "validoAte" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LojaNordPointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LojaNordPointRule_activityType_key" ON "LojaNordPointRule"("activityType");

-- CreateIndex
CREATE INDEX "LojaNordRedemption_userId_createdAt_idx" ON "LojaNordRedemption"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LojaNordRedemption_empresaId_status_idx" ON "LojaNordRedemption"("empresaId", "status");

-- CreateIndex
CREATE INDEX "LojaNordPointTransaction_userId_createdAt_idx" ON "LojaNordPointTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LojaNordPointTransaction_empresaId_createdAt_idx" ON "LojaNordPointTransaction"("empresaId", "createdAt");

-- AddForeignKey
ALTER TABLE "LojaNordRedemption" ADD CONSTRAINT "LojaNordRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LojaNordRedemption" ADD CONSTRAINT "LojaNordRedemption_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LojaNordRedemption" ADD CONSTRAINT "LojaNordRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "LojaNordReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LojaNordRedemption" ADD CONSTRAINT "LojaNordRedemption_aprovadoPorId_fkey" FOREIGN KEY ("aprovadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LojaNordPointTransaction" ADD CONSTRAINT "LojaNordPointTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LojaNordPointTransaction" ADD CONSTRAINT "LojaNordPointTransaction_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LojaNordPointTransaction" ADD CONSTRAINT "LojaNordPointTransaction_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "LojaNordPointRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LojaNordPointTransaction" ADD CONSTRAINT "LojaNordPointTransaction_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "LojaNordRedemption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LojaNordPointTransaction" ADD CONSTRAINT "LojaNordPointTransaction_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

