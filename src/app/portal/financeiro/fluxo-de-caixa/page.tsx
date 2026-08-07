import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { FinanceTabs } from "../finance-tabs";
import { FluxoCaixaClient } from "./fluxo-client";
import { subDays } from "date-fns";

export default async function FluxoDeCaixaPage() {
  const since = subDays(new Date(), 180);

  const [payables, receivables, accounts] = await Promise.all([
    prisma.payable.findMany({
      where: { status: { in: ["PAGO", "PARCIALMENTE_PAGO"] }, dataPagamento: { gte: since } },
      select: { valor: true, dataPagamento: true, empresa: true, categoria: { select: { name: true } } },
    }),
    prisma.receivable.findMany({
      where: { status: { in: ["PAGO", "PARCIALMENTE_PAGO"] }, dataRecebimento: { gte: since } },
      select: { valor: true, dataRecebimento: true, empresa: true, categoria: { select: { name: true } } },
    }),
    prisma.bankAccount.findMany({ where: { active: true } }),
  ]);

  const saldoInicial = accounts.reduce((a, acc) => a + acc.saldoInicial, 0);

  const serialized = {
    payables: payables.map((p) => ({
      valor: p.valor,
      date: p.dataPagamento!.toISOString(),
      empresa: p.empresa,
      categoria: p.categoria.name,
    })),
    receivables: receivables.map((r) => ({
      valor: r.valor,
      date: r.dataRecebimento!.toISOString(),
      empresa: r.empresa,
      categoria: r.categoria.name,
    })),
    saldoInicial,
  };

  return (
    <PageContainer title="Financeiro" subtitle="Fluxo de Caixa">
      <div className="space-y-6">
        <FinanceTabs />
        <FluxoCaixaClient data={serialized} />
      </div>
    </PageContainer>
  );
}
