import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { Section, Badge } from "@/components/ui/stat-card";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { subDays } from "date-fns";
import { Trophy } from "lucide-react";

export default async function GarconsDesempenhoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const since = subDays(new Date(), 30);

  const sales = await prisma.sale.findMany({
    where: { empresaId: { in: empresaIds }, dateTime: { gte: since }, garcomId: { not: null } },
    include: { items: true, garcom: { select: { id: true, name: true, photoUrl: true } } },
  });

  const byGarcom = new Map<
    string,
    { name: string; photo: string | null; totalVendido: number; qtdItens: number; mesas: number; bebidas: number; sobremesas: number }
  >();

  for (const sale of sales) {
    if (!sale.garcomId || !sale.garcom) continue;
    const cur = byGarcom.get(sale.garcomId) ?? {
      name: sale.garcom.name,
      photo: sale.garcom.photoUrl,
      totalVendido: 0,
      qtdItens: 0,
      mesas: 0,
      bebidas: 0,
      sobremesas: 0,
    };
    cur.totalVendido += sale.valorTotal;
    cur.mesas += 1;
    for (const item of sale.items) {
      cur.qtdItens += item.quantidade;
      if (item.categoria === "BEBIDA" || item.categoria === "DRINK") cur.bebidas += item.quantidade;
      if (item.categoria === "SOBREMESA") cur.sobremesas += item.quantidade;
    }
    byGarcom.set(sale.garcomId, cur);
  }

  const ranking = [...byGarcom.entries()]
    .map(([id, g]) => ({
      id,
      ...g,
      ticketMedio: g.mesas ? g.totalVendido / g.mesas : 0,
      itensPorMesa: g.mesas ? g.qtdItens / g.mesas : 0,
    }))
    .sort((a, b) => b.totalVendido - a.totalVendido);

  return (
    <PageContainer title="Vendas" subtitle="Desempenho por Garçom">
      <div className="space-y-6">
        <Section title="Ranking (últimos 30 dias)">
          <div className="space-y-2">
            {ranking.map((g, idx) => (
              <div key={g.id} className="grid grid-cols-2 md:grid-cols-7 gap-3 items-center rounded-lg border border-nord-border/60 p-3">
                <div className="flex items-center gap-2 md:col-span-2">
                  {idx === 0 && <Trophy size={14} className="text-amber-400 shrink-0" />}
                  <span className="text-white text-sm font-medium truncate">{idx + 1}º {g.name}</span>
                </div>
                <StatMini label="Total vendido" value={formatCurrency(g.totalVendido)} />
                <StatMini label="Itens vendidos" value={formatNumber(g.qtdItens)} />
                <StatMini label="Ticket médio" value={formatCurrency(g.ticketMedio)} />
                <StatMini label="Mesas atendidas" value={formatNumber(g.mesas)} />
                <StatMini label="Itens/mesa" value={formatNumber(g.itensPorMesa, 1)} />
              </div>
            ))}
            {ranking.length === 0 && (
              <p className="text-sm text-nord-gray text-center py-8">Nenhuma venda com garçom associado nos últimos 30 dias.</p>
            )}
          </div>
        </Section>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ranking.map((g) => (
            <div key={g.id} className="nord-card p-4">
              <p className="text-white font-medium text-sm mb-2">{g.name}</p>
              <div className="flex gap-2">
                <Badge tone="info">{formatNumber(g.bebidas)} bebidas</Badge>
                <Badge tone="warning">{formatNumber(g.sobremesas)} sobremesas</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-nord-gray">{label}</p>
      <p className="text-sm text-white font-medium">{value}</p>
    </div>
  );
}
