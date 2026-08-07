import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { FinanceTabs } from "../finance-tabs";
import { CaixaClient } from "./caixa-client";

export default async function CaixaDaEmpresaPage() {
  const [movements, accounts] = await Promise.all([
    prisma.cashMovement.findMany({
      orderBy: { date: "desc" },
      take: 200,
      include: {
        bankAccount: { select: { name: true } },
        destino: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.bankAccount.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const serialized = movements.map((m) => ({ ...m, date: m.date.toISOString() }));

  return (
    <PageContainer title="Financeiro" subtitle="Caixa da Empresa">
      <div className="space-y-6">
        <FinanceTabs />
        <CaixaClient initialMovements={serialized} accounts={accounts} />
      </div>
    </PageContainer>
  );
}
