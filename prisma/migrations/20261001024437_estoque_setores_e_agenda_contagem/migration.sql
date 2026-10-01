-- CreateTable
CREATE TABLE "StockSector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockSector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountSchedule" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "type" "CountType" NOT NULL,
    "setor" TEXT,
    "responsavelId" TEXT,
    "horario" TEXT NOT NULL,
    "segunda" BOOLEAN NOT NULL DEFAULT true,
    "terca" BOOLEAN NOT NULL DEFAULT true,
    "quarta" BOOLEAN NOT NULL DEFAULT true,
    "quinta" BOOLEAN NOT NULL DEFAULT true,
    "sexta" BOOLEAN NOT NULL DEFAULT true,
    "sabado" BOOLEAN NOT NULL DEFAULT true,
    "domingo" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ultimoLembreteData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCountSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockSector_name_key" ON "StockSector"("name");

-- CreateIndex
CREATE INDEX "StockCountSchedule_empresaId_type_idx" ON "StockCountSchedule"("empresaId", "type");

-- AddForeignKey
ALTER TABLE "StockCountSchedule" ADD CONSTRAINT "StockCountSchedule_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountSchedule" ADD CONSTRAINT "StockCountSchedule_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
