-- CreateTable
CREATE TABLE "DeliveryMeeting" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "cancelamentoPercent" DOUBLE PRECISION,
    "avaliacaoNota" DOUBLE PRECISION,
    "tempoEntregaMinutos" DOUBLE PRECISION,
    "chamadosPercent" DOUBLE PRECISION,
    "cancelamentoMetaPercent" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "avaliacaoMetaNota" DOUBLE PRECISION NOT NULL DEFAULT 4.7,
    "tempoEntregaMetaMinutos" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "chamadosMetaPercent" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "premiacaoCancelamento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoAvaliacao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoTempoEntrega" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoChamados" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryMeeting_empresaId_periodo_key" ON "DeliveryMeeting"("empresaId", "periodo");

-- AddForeignKey
ALTER TABLE "DeliveryMeeting" ADD CONSTRAINT "DeliveryMeeting_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryMeeting" ADD CONSTRAINT "DeliveryMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

