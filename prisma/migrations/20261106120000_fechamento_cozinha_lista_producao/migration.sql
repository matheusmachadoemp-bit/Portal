-- CreateTable
CREATE TABLE "FechamentoListaProducaoResposta" (
    "id" TEXT NOT NULL,
    "submissaoId" TEXT NOT NULL,
    "productionItemId" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FechamentoListaProducaoResposta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FechamentoListaProducaoResposta_productionItemId_idx" ON "FechamentoListaProducaoResposta"("productionItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FechamentoListaProducaoResposta_submissaoId_productionItemI_key" ON "FechamentoListaProducaoResposta"("submissaoId", "productionItemId");

-- AddForeignKey
ALTER TABLE "FechamentoListaProducaoResposta" ADD CONSTRAINT "FechamentoListaProducaoResposta_submissaoId_fkey" FOREIGN KEY ("submissaoId") REFERENCES "FechamentoSubmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoListaProducaoResposta" ADD CONSTRAINT "FechamentoListaProducaoResposta_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

