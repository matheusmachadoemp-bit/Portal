import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { Section } from "@/components/ui/stat-card";
import { EntregaChart } from "./chart";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { subDays } from "date-fns";

const PERIOD_DAYS = 30;

export default async function VendasPorAreaEntregaPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const since = subDays(new Date(), PERIOD_DAYS);

  const sales = await prisma.sale.findMany({
    where: { empresaId: { in: empresaIds }, channel: "DELIVERY", dateTime: { gte: since }, bairro: { not: null } },
    select: { bairro: true, regiao: true, valorTotal: true },
  });

  const byBairro = new Map<string, { bairro: string; regiao: string | null; pedidos: number; faturamento: number }>();
  for (const s of sales) {
    const key = s.bairro!;
    const cur = byBairro.get(key) ?? { bairro: key, regiao: s.regiao, pedidos: 0, faturamento: 0 };
    cur.pedidos += 1;
    cur.faturamento += s.valorTotal;
    byBairro.set(key, cur);
  }

  const rows = [...byBairro.values()]
    .map((r) => ({ ...r, ticketMedio: r.pedidos ? r.faturamento / r.pedidos : 0, frequencia: r.pedidos / PERIOD_DAYS }))
    .sort((a, b) => b.faturamento - a.faturamento);

  return (
    <PageContainer title="Vendas" subtitle="Área de Entrega">
      <div className="space-y-6">
        <Section title={`Pedidos delivery por bairro (últimos ${PERIOD_DAYS} dias)`}>
          <EntregaChart data={rows.slice(0, 12).map((r) => ({ name: r.bairro, value: Math.round(r.faturamento) }))} />
        </Section>
        <Section title="Detalhamento por bairro">
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 pr-4">Bairro</th>
                  <th className="py-2 pr-4">Região</th>
                  <th className="py-2 pr-4">Pedidos</th>
                  <th className="py-2 pr-4">Faturamento</th>
                  <th className="py-2 pr-4">Ticket médio</th>
                  <th className="py-2 pr-4">Frequência (pedidos/dia)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.bairro} className="border-b border-nord-border/50 hover:bg-white/5">
                    <td className="py-2.5 pr-4 text-white">{r.bairro}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{r.regiao ?? "-"}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{r.pedidos}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(r.faturamento)}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(r.ticketMedio)}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{formatNumber(r.frequencia, 2)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-nord-gray">
                      Nenhum pedido de delivery com bairro informado nos últimos {PERIOD_DAYS} dias.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </PageContainer>
  );
}
