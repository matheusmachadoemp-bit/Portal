import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { FinanceTabs } from "../finance-tabs";
import { ContasPagarClient } from "./contas-pagar-client";
import { subDays } from "date-fns";

export default async function ContasAPagarPage() {
  const [payables, categorias, contas] = await Promise.all([
    prisma.payable.findMany({
      where: { dataVencimento: { gte: subDays(new Date(), 120) } },
      orderBy: { dataVencimento: "asc" },
      include: { categoria: true, bankAccount: true, createdBy: { select: { name: true } } },
    }),
    prisma.financialCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const serialized = payables.map((p) => ({
    ...p,
    dataCompetencia: p.dataCompetencia.toISOString(),
    dataVencimento: p.dataVencimento.toISOString(),
    dataPagamento: p.dataPagamento ? p.dataPagamento.toISOString() : null,
  }));

  return (
    <PageContainer title="Financeiro" subtitle="Contas a Pagar">
      <div className="space-y-6">
        <FinanceTabs />
        <ContasPagarClient initialPayables={serialized} categorias={categorias} contas={contas} />
      </div>
    </PageContainer>
  );
}
