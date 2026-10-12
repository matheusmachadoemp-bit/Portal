import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { ConciliacaoClient } from "./conciliacao-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { resolveMatchLabels } from "@/lib/bank-reconciliation";
import { presetRange } from "@/lib/period-presets";
import { spEndOfDay, spStartOfDay } from "@/lib/timezone";

export default async function ConciliacaoBancariaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  // A tela abre em "Este mês": com a conexão com o banco entram ~700 lançamentos por mês, então
  // carregar o histórico inteiro de uma vez deixaria a página pesada. "Todo o período" continua
  // disponível no filtro (busca sob demanda pela API).
  const month = presetRange("thisMonth");
  const [accounts, transactions] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { empresaId: { in: empresaIds }, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.bankTransaction.findMany({
      where: { empresaId: { in: empresaIds }, date: { gte: spStartOfDay(month.from), lte: spEndOfDay(month.to) } },
      orderBy: [{ date: "desc" }, { occurredAt: "desc" }, { createdAt: "desc" }],
      include: { bankAccount: true, import: { select: { fileName: true } } },
      take: 5000, // teto de segurança
    }),
  ]);

  const matchLabels = await resolveMatchLabels(transactions);

  const serializedAccounts = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    bank: a.bank,
    openFinance: !!a.openFinanceAccountId,
    lastSyncAt: a.lastSyncAt ? a.lastSyncAt.toISOString() : null,
    bankBalance: a.bankBalance,
    bankBalanceAt: a.bankBalanceAt ? a.bankBalanceAt.toISOString() : null,
  }));
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
    externalId: t.externalId,
    occurredAt: t.occurredAt ? t.occurredAt.toISOString() : null,
    counterpart: t.counterpart,
    bankCategory: t.bankCategory,
    paymentMethod: t.paymentMethod,
    pendingAtBank: t.pendingAtBank,
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
