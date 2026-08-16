import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { FluxoCaixaClient } from "./fluxo-client";
import { subDays } from "date-fns";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function FluxoDeCaixaPage() {
  const since = subDays(new Date(), 180);
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [payables, receivables, accounts] = await Promise.all([
    prisma.payable.findMany({
      where: {
        empresaId: { in: empresaIds },
        status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
        dataPagamento: { gte: since },
      },
      select: {
        valor: true,
        dataPagamento: true,
        empresa: { select: { id: true, name: true } },
        categoria: { select: { name: true } },
      },
    }),
    prisma.receivable.findMany({
      where: {
        empresaId: { in: empresaIds },
        status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
        dataRecebimento: { gte: since },
      },
      select: {
        valor: true,
        dataRecebimento: true,
        empresa: { select: { id: true, name: true } },
        categoria: { select: { name: true } },
      },
    }),
    prisma.bankAccount.findMany({ where: { active: true, empresaId: { in: empresaIds } } }),
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
        <FluxoCaixaClient data={serialized} />
      </div>
    </PageContainer>
  );
}
