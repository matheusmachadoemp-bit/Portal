import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ContasReceberClient } from "./contas-receber-client";
import { subDays } from "date-fns";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getActiveFinancialCategories } from "@/lib/financial-categories";

export default async function ContasAReceberPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [receivables, categorias, contas] = await Promise.all([
    prisma.receivable.findMany({
      where: { empresaId: { in: empresaIds }, dataVencimento: { gte: subDays(new Date(), 120) } },
      orderBy: { dataVencimento: "asc" },
      include: { categoria: true, bankAccount: true, createdBy: { select: { name: true } }, empresa: true },
    }),
    getActiveFinancialCategories(),
    prisma.bankAccount.findMany({ where: { active: true, empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
  ]);

  const serialized = receivables.map((r) => ({
    ...r,
    dataCompetencia: r.dataCompetencia.toISOString(),
    dataVencimento: r.dataVencimento.toISOString(),
    dataRecebimento: r.dataRecebimento ? r.dataRecebimento.toISOString() : null,
  }));

  return (
    <PageContainer title="Financeiro" subtitle="Contas a Receber">
      <div className="space-y-6">
        <ContasReceberClient
          initialReceivables={serialized}
          categorias={categorias}
          contas={contas}
          canCreate={ctx?.mode === "single"}
        />
      </div>
    </PageContainer>
  );
}
