-- CreateTable
CREATE TABLE "KitchenMeeting" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "cmvPercent" DOUBLE PRECISION,
    "desperdicioValor" DOUBLE PRECISION,
    "tempoPedidoMinutos" DOUBLE PRECISION,
    "organizacaoPercent" DOUBLE PRECISION,
    "cmvMetaPercent" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "desperdicioMetaValor" DOUBLE PRECISION NOT NULL DEFAULT 450,
    "tempoPedidoMetaMinutos" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "organizacaoMetaPercent" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "premiacaoCmv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoDesperdicio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoTempoPedido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiacaoOrganizacao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KitchenMeeting_empresaId_periodo_key" ON "KitchenMeeting"("empresaId", "periodo");

-- AddForeignKey
ALTER TABLE "KitchenMeeting" ADD CONSTRAINT "KitchenMeeting_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenMeeting" ADD CONSTRAINT "KitchenMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

