import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ContasBancariasClient } from "./contas-bancarias-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function ContasBancariasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const accounts = await prisma.bankAccount.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { name: "asc" },
  });
  const serialized = accounts.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  return (
    <PageContainer title="Financeiro" subtitle="Contas Bancárias">
      <div className="space-y-6">
        <ContasBancariasClient initialAccounts={serialized} canCreate={ctx?.mode === "single"} />
      </div>
    </PageContainer>
  );
}
