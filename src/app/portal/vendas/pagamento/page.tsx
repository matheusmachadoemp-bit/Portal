import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { VendasTabs } from "../vendas-tabs";
import { Section } from "@/components/ui/stat-card";
import { PagamentoChart } from "./chart";
import { formatCurrency, formatPercent } from "@/lib/calc";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { PAYMENT_METHOD_LABEL, SALE_PAYMENT_METHODS } from "@/lib/vendas-analytics";
import { subDays } from "date-fns";

export default async function VendasPorPagamentoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const since = subDays(new Date(), 30);

  const sales = await prisma.sale.findMany({
    where: { empresaId: { in: empresaIds }, dateTime: { gte: since } },
    select: { formaPagamento: true, valorTotal: true },
  });

  const total = sales.reduce((sum, s) => sum + s.valorTotal, 0);
  const byMethod = SALE_PAYMENT_METHODS.map((method) => {
    const valor = sales.filter((s) => s.formaPagamento === method).reduce((sum, s) => sum + s.valorTotal, 0);
    return { method, label: PAYMENT_METHOD_LABEL[method], valor, percent: total ? (valor / total) * 100 : 0 };
  }).filter((m) => m.valor > 0);

  return (
    <PageContainer title="Vendas" subtitle="Forma de Pagamento">
      <div className="space-y-6">
        <VendasTabs />
        <Section title="Vendas por forma de pagamento (últimos 30 dias)">
          <PagamentoChart data={byMethod.map((m) => ({ name: m.label, value: Math.round(m.valor) }))} />
          <div className="mt-4 space-y-1.5">
            {byMethod.map((m) => (
              <div key={m.method} className="flex items-center justify-between text-sm border-b border-nord-border/60 py-1.5 last:border-0">
                <span className="text-white">{m.label}</span>
                <span className="text-nord-gray">
                  {formatCurrency(m.valor)} · {formatPercent(m.percent)}
                </span>
              </div>
            ))}
            {byMethod.length === 0 && <p className="text-sm text-nord-gray text-center py-6">Nenhuma venda lançada nos últimos 30 dias.</p>}
          </div>
        </Section>
      </div>
    </PageContainer>
  );
}
