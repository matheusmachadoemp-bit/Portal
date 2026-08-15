import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { VendasTabs } from "../vendas-tabs";
import { Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { PorHoraChart } from "./chart";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { formatCurrency } from "@/lib/calc";
import { subDays } from "date-fns";

export default async function VendasPorHoraPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const since = subDays(new Date(), 30);

  const sales = await prisma.sale.findMany({
    where: { empresaId: { in: empresaIds }, dateTime: { gte: since } },
    select: { dateTime: true, valorTotal: true },
  });

  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, "0")}h`, faturamento: 0, pedidos: 0 }));
  for (const s of sales) {
    const hour = s.dateTime.getHours();
    byHour[hour].faturamento += s.valorTotal;
    byHour[hour].pedidos += 1;
  }

  const pico = [...byHour].sort((a, b) => b.faturamento - a.faturamento)[0];
  const menorMovimento = byHour.filter((h) => h.pedidos > 0).sort((a, b) => a.faturamento - b.faturamento)[0];

  return (
    <PageContainer title="Vendas" subtitle="Vendas por Hora">
      <div className="space-y-6">
        <VendasTabs />
        <SortableStatCards
          storageKey="vendas-por-hora-kpi-order"
          className="grid grid-cols-2 gap-4"
          cards={[
            { key: "horario-pico", label: "Horário de pico", value: pico ? `${pico.label} (${formatCurrency(pico.faturamento)})` : "—", icon: "TrendingUp", color: "#22c55e" },
            { key: "horario-menor-movimento", label: "Horário de menor movimento", value: menorMovimento ? `${menorMovimento.label} (${formatCurrency(menorMovimento.faturamento)})` : "—", icon: "TrendingDown", color: "#ef4444" },
          ]}
        />
        <Section title="Faturamento por horário (últimos 30 dias)">
          <PorHoraChart data={byHour} />
        </Section>
      </div>
    </PageContainer>
  );
}
