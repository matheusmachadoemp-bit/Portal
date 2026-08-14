-- CreateEnum
CREATE TYPE "CampaignAudienceType" AS ENUM ('TODOS', 'SEGMENTO', 'CLIENTES');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "CampaignOfferType" AS ENUM ('CUPOM', 'DESCONTO_PERCENTUAL', 'DESCONTO_VALOR', 'PRODUTO_GRATIS', 'CASHBACK', 'PONTOS', 'SEM_OFERTA');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('RASCUNHO', 'AGENDADA', 'ENVIADA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'ENTREGUE', 'VISUALIZADO', 'CLICOU', 'CONVERTEU');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('PRIMEIRA_COMPRA', 'SEGUNDA_COMPRA', 'INATIVO_30', 'INATIVO_60', 'INATIVO_90', 'ANIVERSARIO', 'CLIENTE_VIP', 'POS_VENDA', 'AVALIACAO', 'RECUPERACAO');

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('MENSAGEM', 'TAG', 'OFERTA');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('GANHO', 'RESGATE');

-- CreateEnum
CREATE TYPE "NpsStatus" AS ENUM ('PENDENTE', 'EM_CONTATO', 'RESOLVIDO');

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "canalPreferido" "SaleChannel",
ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "dataNascimento" TIMESTAMP(3),
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "whatsapp" TEXT;

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSegment" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "criteria" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'RASCUNHO',
    "audienceType" "CampaignAudienceType" NOT NULL DEFAULT 'TODOS',
    "segmentId" TEXT,
    "channel" "CampaignChannel" NOT NULL DEFAULT 'WHATSAPP',
    "offerType" "CampaignOfferType" NOT NULL DEFAULT 'SEM_OFERTA',
    "offerValue" DOUBLE PRECISION,
    "offerDescription" TEXT,
    "message" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "waitDays" INTEGER NOT NULL DEFAULT 0,
    "actionType" "AutomationActionType" NOT NULL DEFAULT 'MENSAGEM',
    "message" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyConfig" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pontosPorReal" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyReward" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pontosNecessarios" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyAccount" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "pontos" INTEGER NOT NULL DEFAULT 0,
    "cashback" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tipo" "LoyaltyTransactionType" NOT NULL,
    "pontos" INTEGER NOT NULL DEFAULT 0,
    "cashback" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpsResponse" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "saleId" TEXT,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "status" "NpsStatus" NOT NULL DEFAULT 'PENDENTE',
    "responsavelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpsResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerNote_clienteId_idx" ON "CustomerNote"("clienteId");

-- CreateIndex
CREATE INDEX "CrmSegment_empresaId_idx" ON "CrmSegment"("empresaId");

-- CreateIndex
CREATE INDEX "Campaign_empresaId_status_idx" ON "Campaign"("empresaId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_idx" ON "CampaignRecipient"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_clienteId_key" ON "CampaignRecipient"("campaignId", "clienteId");

-- CreateIndex
CREATE INDEX "Automation_empresaId_idx" ON "Automation"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyConfig_empresaId_key" ON "LoyaltyConfig"("empresaId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_empresaId_idx" ON "LoyaltyReward"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_clienteId_key" ON "LoyaltyAccount"("clienteId");

-- CreateIndex
CREATE INDEX "LoyaltyAccount_empresaId_idx" ON "LoyaltyAccount"("empresaId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_accountId_idx" ON "LoyaltyTransaction"("accountId");

-- CreateIndex
CREATE INDEX "NpsResponse_empresaId_createdAt_idx" ON "NpsResponse"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "Cliente_empresaId_dataNascimento_idx" ON "Cliente"("empresaId", "dataNascimento");

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSegment" ADD CONSTRAINT "CrmSegment_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSegment" ADD CONSTRAINT "CrmSegment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "CrmSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyConfig" ADD CONSTRAINT "LoyaltyConfig_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsResponse" ADD CONSTRAINT "NpsResponse_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsResponse" ADD CONSTRAINT "NpsResponse_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsResponse" ADD CONSTRAINT "NpsResponse_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

