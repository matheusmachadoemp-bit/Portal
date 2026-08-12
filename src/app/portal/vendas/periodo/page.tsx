import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { PeriodoClient } from "./periodo-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { resolvePeriod } from "@/lib/periods";

export default async function VendasPorPeriodoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const { from, to, prevFrom, prevTo } = resolvePeriod("mes");

  const [atualSales, anteriorSales] = await Promise.all([
    prisma.sale.findMany({ where: { empresaId: { in: empresaIds }, dateTime: { gte: from, lte: to } }, select: { valorTotal: true } }),
    prisma.sale.findMany({ where: { empresaId: { in: empresaIds }, dateTime: { gte: prevFrom, lte: prevTo } }, select: { valorTotal: true } }),
  ]);

  const toSummary = (sales: { valorTotal: number }[]) => {
    const faturamento = sales.reduce((sum, s) => sum + s.valorTotal, 0);
    const pedidos = sales.length;
    return { faturamento, pedidos, ticketMedio: pedidos ? faturamento / pedidos : 0 };
  };

  return (
    <PageContainer title="Vendas" subtitle="Vendas por Período">
      <div className="space-y-6">
        <PeriodoClient initialKey="mes" initialAtual={toSummary(atualSales)} initialAnterior={toSummary(anteriorSales)} />
      </div>
    </PageContainer>
  );
}
