-- AlterTable
ALTER TABLE "SalaoMeeting" ADD COLUMN     "melhorVendedorNome" TEXT,
ADD COLUMN     "melhorVendedorValor" DOUBLE PRECISION,
ADD COLUMN     "npsAmbiente" DOUBLE PRECISION,
ADD COLUMN     "npsAtendimento" DOUBLE PRECISION,
ADD COLUMN     "npsQualidadeProduto" DOUBLE PRECISION,
ADD COLUMN     "npsRodizio" DOUBLE PRECISION,
ADD COLUMN     "npsTempoEspera" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SalaoProductGoal" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "quantidade" INTEGER,
    "meta" INTEGER NOT NULL DEFAULT 0,
    "premiacao" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SalaoProductGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalaoProductGoal_meetingId_produto_key" ON "SalaoProductGoal"("meetingId", "produto");

-- AddForeignKey
ALTER TABLE "SalaoProductGoal" ADD CONSTRAINT "SalaoProductGoal_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "SalaoMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

