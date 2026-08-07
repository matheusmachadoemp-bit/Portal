import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { FinanceTabs } from "../finance-tabs";
import { ContasBancariasClient } from "./contas-bancarias-client";

export default async function ContasBancariasPage() {
  const accounts = await prisma.bankAccount.findMany({ orderBy: { name: "asc" } });
  const serialized = accounts.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  return (
    <PageContainer title="Financeiro" subtitle="Contas Bancárias">
      <div className="space-y-6">
        <FinanceTabs />
        <ContasBancariasClient initialAccounts={serialized} />
      </div>
    </PageContainer>
  );
}
