import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ConciliacaoClient } from "./conciliacao-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { resolveMatchLabels } from "@/lib/bank-reconciliation";

export default async function ConciliacaoBancariaPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [accounts, transactions] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { empresaId: { in: empresaIds }, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.bankTransaction.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { date: "desc" },
      include: { bankAccount: true, import: { select: { fileName: true } } },
      take: 200,
    }),
  ]);

  const matchLabels = await resolveMatchLabels(transactions);

  const serializedAccounts = accounts.map((a) => ({ id: a.id, name: a.name, bank: a.bank }));
  const serializedTransactions = transactions.map((t) => ({
    id: t.id,
    date: t.date.toISOString(),
    descricao: t.descricao,
    direction: t.direction,
    valor: t.valor,
    status: t.status,
    observacoes: t.observacoes,
    bankAccountName: t.bankAccount.name,
    importFileName: t.import.fileName,
    matchedLabel: t.matchedType && t.matchedId ? matchLabels.get(`${t.matchedType}:${t.matchedId}`) ?? null : null,
  }));

  return (
    <PageContainer title="Financeiro" subtitle="Conciliação Bancária">
      <div className="space-y-6">
        <ConciliacaoClient
          accounts={serializedAccounts}
          initialTransactions={serializedTransactions}
          canImport={ctx?.mode === "single"}
        />
      </div>
    </PageContainer>
  );
}
