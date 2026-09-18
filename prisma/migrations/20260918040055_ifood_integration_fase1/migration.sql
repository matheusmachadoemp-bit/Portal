-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "ifoodClientId" TEXT,
ADD COLUMN     "ifoodClientSecretCipher" TEXT,
ADD COLUMN     "ifoodLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "ifoodMerchantId" TEXT,
ADD COLUMN     "ifoodMerchantName" TEXT,
ADD COLUMN     "ifoodSyncEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "IfoodOrder" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ifoodOrderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "channel" "SaleChannel" NOT NULL DEFAULT 'DELIVERY',
    "platform" "SalePlatform" NOT NULL DEFAULT 'IFOOD',
    "formaPagamento" "PaymentMethod" NOT NULL DEFAULT 'OUTRO',
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cancelado" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IfoodOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IfoodSyncLog" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "IfoodSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IfoodOrder_empresaId_orderDate_idx" ON "IfoodOrder"("empresaId", "orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "IfoodOrder_empresaId_ifoodOrderId_key" ON "IfoodOrder"("empresaId", "ifoodOrderId");

-- CreateIndex
CREATE INDEX "IfoodSyncLog_empresaId_startedAt_idx" ON "IfoodSyncLog"("empresaId", "startedAt");

-- AddForeignKey
ALTER TABLE "IfoodOrder" ADD CONSTRAINT "IfoodOrder_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IfoodSyncLog" ADD CONSTRAINT "IfoodSyncLog_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
