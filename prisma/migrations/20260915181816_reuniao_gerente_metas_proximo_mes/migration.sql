-- Reunião Gerente — card "Metas de [próximo mês]" (MetaProximoMes).

-- NOTA (fora do escopo desta migration): ao gerar esta migration com `prisma migrate dev`, o
-- diff também trouxe 3 DropForeignKey/AddForeignKey (Sale/SalesEntry/MarketingEntry
-- .createdById, RESTRICT -> SET NULL) e 1 RenameIndex (MetaAdsInsight) — drift PRÉ-EXISTENTE
-- entre schema.prisma e o histórico de migrations, confirmado reproduzível mesmo sem nenhuma
-- alteração deste agente (checado revertendo temporariamente as mudanças de MetaProximoMes e
-- gerando o diff de novo contra produção limpa). Removido deste arquivo de propósito — não faz
-- parte desta tarefa (Metas do próximo mês) e é uma mudança de comportamento real (hoje excluir
-- um usuário que já criou uma venda/lançamento de marketing falha por RESTRICT; SET NULL faria
-- isso passar a funcionar silenciosamente, só desvinculando o "criado por"), não algo pra
-- decidir de brinde numa migration sobre outro assunto. Já reportado separadamente (mesmo achado
-- confirmado de forma independente em claude/fechamento-dia-lideranca).

-- CreateTable
CREATE TABLE "MetaProximoMes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "metrica" TEXT NOT NULL,
    "valorAlvo" TEXT NOT NULL,
    "valorPremio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "destinatario" TEXT NOT NULL DEFAULT 'Equipe',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaProximoMes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaProximoMes_empresaId_periodo_idx" ON "MetaProximoMes"("empresaId", "periodo");

-- AddForeignKey
ALTER TABLE "MetaProximoMes" ADD CONSTRAINT "MetaProximoMes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaProximoMes" ADD CONSTRAINT "MetaProximoMes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
