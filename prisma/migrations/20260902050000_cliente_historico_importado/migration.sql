-- CreateTable
CREATE TABLE "ClienteHistoricoImportado" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "numeroPedido" TEXT,
    "itens" TEXT,
    "valorGasto" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteHistoricoImportado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClienteHistoricoImportado_clienteId_numeroPedido_key" ON "ClienteHistoricoImportado"("clienteId", "numeroPedido");

-- CreateIndex
CREATE INDEX "ClienteHistoricoImportado_empresaId_idx" ON "ClienteHistoricoImportado"("empresaId");

-- AddForeignKey
ALTER TABLE "ClienteHistoricoImportado" ADD CONSTRAINT "ClienteHistoricoImportado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteHistoricoImportado" ADD CONSTRAINT "ClienteHistoricoImportado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
