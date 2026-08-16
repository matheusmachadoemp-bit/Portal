-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN "saiposApiToken" TEXT;
ALTER TABLE "Empresa" ADD COLUMN "saiposLojaId" TEXT;
ALTER TABLE "Empresa" ADD COLUMN "saiposSyncEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Empresa" ADD COLUMN "saiposLastSyncAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SaiposSale" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "saiposId" TEXT NOT NULL,
    "shiftDate" TIMESTAMP(3) NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "channel" "SaleChannel" NOT NULL DEFAULT 'SALAO',
    "formaPagamento" "PaymentMethod" NOT NULL DEFAULT 'OUTRO',
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaiposSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaiposSyncLog" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "SaiposSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaiposSale_empresaId_saiposId_key" ON "SaiposSale"("empresaId", "saiposId");

-- CreateIndex
CREATE INDEX "SaiposSale_empresaId_shiftDate_idx" ON "SaiposSale"("empresaId", "shiftDate");

-- CreateIndex
CREATE INDEX "SaiposSyncLog_empresaId_startedAt_idx" ON "SaiposSyncLog"("empresaId", "startedAt");

-- AddForeignKey
ALTER TABLE "SaiposSale" ADD CONSTRAINT "SaiposSale_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaiposSyncLog" ADD CONSTRAINT "SaiposSyncLog_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
