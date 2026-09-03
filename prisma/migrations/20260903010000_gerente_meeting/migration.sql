
-- CreateTable
CREATE TABLE "GerenteMeeting" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "faturamentoTotalValor" DOUBLE PRECISION,
    "cmvPercent" DOUBLE PRECISION,
    "npsPercent" DOUBLE PRECISION,
    "cancelamentoDeliveryPercent" DOUBLE PRECISION,
    "turnoverPercent" DOUBLE PRECISION,
    "faltasAtrasosAtestados" INTEGER,
    "checklistOperacionalPercent" DOUBLE PRECISION,
    "faturamentoMetaValor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cmvMetaPercent" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "turnoverMetaPercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "checklistOperacionalMetaPercent" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "premiacaoFaturamento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoCmv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoTurnover" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoChecklist" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GerenteMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GerenteMeeting_empresaId_periodo_key" ON "GerenteMeeting"("empresaId", "periodo");

-- AddForeignKey
ALTER TABLE "GerenteMeeting" ADD CONSTRAINT "GerenteMeeting_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GerenteMeeting" ADD CONSTRAINT "GerenteMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

