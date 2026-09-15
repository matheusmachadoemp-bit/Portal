-- Marketing > Parcerias passa a ter filtro de período (item 26). Os campos
-- cumulativos que existiam em MarketingPartner (quantidadeUtilizada/vendas/
-- gasto — total acumulado desde sempre, sem nenhuma data associada) viram
-- lançamentos por período em MarketingPartnerEntry (mesmo padrão de
-- SalesEntry/MarketingEntry), pra dar pra somar só os lançamentos dentro de
-- um range de datas. MarketingPartner continua existindo, só que agora é
-- puramente o cadastro do parceiro (nome, cupom, observações gerais).

-- CreateTable
CREATE TABLE "MarketingPartnerEntry" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantidadeUtilizada" INTEGER NOT NULL DEFAULT 0,
    "vendas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gasto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingPartnerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingPartnerEntry_partnerId_date_idx" ON "MarketingPartnerEntry"("partnerId", "date");

-- AddForeignKey
ALTER TABLE "MarketingPartnerEntry" ADD CONSTRAINT "MarketingPartnerEntry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "MarketingPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPartnerEntry" ADD CONSTRAINT "MarketingPartnerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migração de dado: todo MarketingPartner já cadastrado até aqui tem
-- vendas/gasto/quantidadeUtilizada acumulados, mas nenhuma data própria —
-- só createdAt/updatedAt de QUANDO O CADASTRO foi criado/editado, não de
-- quando as vendas/o gasto de fato aconteceram. Sem uma data real de
-- referência, a estratégia que preserva o dado sem inventar informação que
-- não temos é: 1 lançamento por parceiro, datado no createdAt do cadastro
-- (data mais antiga e mais próxima de "desde quando esse número vem
-- acumulando" que existe) — inclusive os parceiros com tudo zerado (recém-
-- cadastrados, ainda sem vendas), para manter 1:1 e não criar um caso
-- especial silencioso. "observacoes" do parceiro fica só no cadastro (é
-- nota geral sobre o parceiro, não do período), não é copiada pro
-- lançamento.
INSERT INTO "MarketingPartnerEntry" (
    "id", "partnerId", "date", "quantidadeUtilizada", "vendas", "gasto", "createdById", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    "id",
    "createdAt",
    "quantidadeUtilizada",
    "vendas",
    "gasto",
    "createdById",
    "createdAt",
    "updatedAt"
FROM "MarketingPartner";

-- AlterTable
ALTER TABLE "MarketingPartner" DROP COLUMN "gasto",
DROP COLUMN "quantidadeUtilizada",
DROP COLUMN "vendas";
