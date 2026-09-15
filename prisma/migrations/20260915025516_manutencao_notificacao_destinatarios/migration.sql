-- CreateTable
CREATE TABLE "ManutencaoNotificacaoDestinatario" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManutencaoNotificacaoDestinatario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManutencaoNotificacaoDestinatario_empresaId_idx" ON "ManutencaoNotificacaoDestinatario"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ManutencaoNotificacaoDestinatario_empresaId_userId_key" ON "ManutencaoNotificacaoDestinatario"("empresaId", "userId");

-- AddForeignKey
ALTER TABLE "ManutencaoNotificacaoDestinatario" ADD CONSTRAINT "ManutencaoNotificacaoDestinatario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoNotificacaoDestinatario" ADD CONSTRAINT "ManutencaoNotificacaoDestinatario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
