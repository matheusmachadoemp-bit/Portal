import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { FaturamentoClient } from "./faturamento-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { buildHalfHourBuckets, computeFaturamentoSummary } from "@/lib/faturamento-analytics";
import { resolveRollingPeriod } from "@/lib/periods";

export default async function FaturamentoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const rolling = resolveRollingPeriod("30dias");

  const [summary, sales] = await Promise.all([
    computeFaturamentoSummary(empresaIds, { key: "hoje", compareMode: "corrido" }),
    prisma.sale.findMany({
      where: { empresaId: { in: empresaIds }, cancelado: false, dateTime: { gte: rolling.from, lte: rolling.to } },
      select: { dateTime: true, valorTotal: true, formaPagamento: true, channel: true, bairro: true },
    }),
  ]);

  const byHour = buildHalfHourBuckets(sales);

  const totalPagamento = sales.reduce((sum, s) => sum + s.valorTotal, 0);
  const byMethod = new Map<string, number>();
  for (const s of sales) byMethod.set(s.formaPagamento, (byMethod.get(s.formaPagamento) ?? 0) + s.valorTotal);

  const byBairro = new Map<string, number>();
  for (const s of sales) {
    if (s.channel !== "DELIVERY" || !s.bairro) continue;
    byBairro.set(s.bairro, (byBairro.get(s.bairro) ?? 0) + s.valorTotal);
  }

  return (
    <PageContainer title="Vendas" subtitle="Faturamento">
      <div className="space-y-6">
        <FaturamentoClient
          initialSummary={summary}
          initialPorHora={{ byHour, pico: [...byHour].sort((a, b) => b.faturamento - a.faturamento)[0] ?? null }}
          initialPagamento={{
            byMethod: [...byMethod.entries()]
              .map(([method, valor]) => ({ method, valor, percent: totalPagamento ? (valor / totalPagamento) * 100 : 0 }))
              .sort((a, b) => b.valor - a.valor),
            pedidos: sales.length,
          }}
          initialEntrega={{
            rows: [...byBairro.entries()]
              .map(([bairro, faturamento]) => ({ bairro, faturamento }))
              .sort((a, b) => b.faturamento - a.faturamento)
              .slice(0, 8),
          }}
        />
      </div>
    </PageContainer>
  );
}
