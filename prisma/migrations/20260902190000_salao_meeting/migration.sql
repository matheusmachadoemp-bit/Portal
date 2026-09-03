-- CreateTable
CREATE TABLE "SalaoMeeting" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "npsPercent" DOUBLE PRECISION,
    "faturamentoValor" DOUBLE PRECISION,
    "ticketMedioValor" DOUBLE PRECISION,
    "npsMetaPercent" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "faturamentoMetaValor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ticketMedioMetaValor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoNps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoFaturamento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoTicketMedio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaoMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalaoMeeting_empresaId_periodo_key" ON "SalaoMeeting"("empresaId", "periodo");

-- AddForeignKey
ALTER TABLE "SalaoMeeting" ADD CONSTRAINT "SalaoMeeting_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaoMeeting" ADD CONSTRAINT "SalaoMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

