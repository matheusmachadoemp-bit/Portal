import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ContasPagarClient } from "./contas-pagar-client";
import { subDays } from "date-fns";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getActiveFinancialCategories } from "@/lib/financial-categories";

export default async function ContasAPagarPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [payables, categorias, contas] = await Promise.all([
    prisma.payable.findMany({
      where: { empresaId: { in: empresaIds }, dataVencimento: { gte: subDays(new Date(), 120) } },
      orderBy: { dataVencimento: "asc" },
      include: { categoria: true, bankAccount: true, createdBy: { select: { name: true } }, empresa: true },
    }),
    getActiveFinancialCategories(),
    prisma.bankAccount.findMany({ where: { active: true, empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
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
        <ContasPagarClient
          initialPayables={serialized}
          categorias={categorias}
          contas={contas}
          canCreate={ctx?.mode === "single"}
        />
      </div>
    </PageContainer>
  );
}
