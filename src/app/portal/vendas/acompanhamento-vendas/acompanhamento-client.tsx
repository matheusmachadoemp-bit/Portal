"use client";

import { useState } from "react";
import { Download, Bike, ShoppingBag, UtensilsCrossed, Ban } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { SortableCardGrid } from "@/components/ui/sortable-stat-cards";
import { formatCurrency, formatNumber, formatPercent, growth } from "@/lib/calc";
import { TURNO_LABEL, SALE_PLATFORM_LABEL, SALE_TYPE_LABEL, type SaleType, type Turno } from "@/lib/vendas-analytics";
import type { SalePlatform } from "@prisma/client";

type ByTypeRow = { type: SaleType; label: string; pedidosA: number; pedidosB: number; valorA: number; valorB: number; ticketA: number; ticketB: number };
type Result = {
  kpis: { faturamentoA: number; faturamentoB: number; pedidosA: number; pedidosB: number; ticketMedioA: number; ticketMedioB: number };
  byType: ByTypeRow[];
};
type Filters = { fromA: string; toA: string; fromB: string; toB: string; turno: Turno | ""; platform: SalePlatform | "" };

// Formato compacto (sem centavos) usado dentro das barras dos cards de 4 categorias, onde o
// espaço é curto e formatCurrency com centavos causa sobreposição dos rótulos.
function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1000) return `R$${(value / 1000).toFixed(1).replace(".", ",")}k`;
  return `R$${formatNumber(value)}`;
}

const TYPE_ICON: Record<SaleType, React.ReactNode> = {
  ENTREGA: <Bike size={12} />,
  BALCAO: <ShoppingBag size={12} />,
  SALAO: <UtensilsCrossed size={12} />,
  CANCELADO: <Ban size={12} />,
};

function Legend() {
  return (
    <div className="flex items-center gap-4 mb-3">
      <span className="flex items-center gap-1.5 text-[11px] text-nord-gray">
        <span className="w-2.5 h-2.5 rounded-sm bg-[#3b82f6] inline-block" /> Data A
      </span>
      <span className="flex items-center gap-1.5 text-[11px] text-nord-gray">
        <span className="w-2.5 h-2.5 rounded-sm bg-[#f59e0b] inline-block" /> Data B
      </span>
    </div>
  );
}

function GroupedBars({
  groups,
  formatValue,
}: {
  groups: { key: string; label: string; icon?: React.ReactNode; valueA: number; valueB: number }[];
  formatValue: (n: number) => string;
}) {
  return (
    <>
      <div className="flex items-end justify-between gap-2.5 h-28 mb-1.5">
        {groups.map((g) => {
          const max = Math.max(g.valueA, g.valueB, 1);
          return (
            <div key={g.key} className="flex items-end gap-1 h-full flex-1 justify-center">
              <div className="flex flex-col items-center justify-end h-full gap-1 w-2/5 min-w-0">
                <span className="text-[9px] font-bold text-white whitespace-nowrap">{formatValue(g.valueA)}</span>
                <div
                  className="w-full rounded-t"
                  style={{ height: `${Math.max(3, (g.valueA / max) * 100)}%`, background: "linear-gradient(180deg, #3b82f6, #1464f4)" }}
                />
              </div>
              <div className="flex flex-col items-center justify-end h-full gap-1 w-2/5 min-w-0">
                <span className="text-[9px] font-bold text-white whitespace-nowrap">{formatValue(g.valueB)}</span>
                <div
                  className="w-full rounded-t"
                  style={{ height: `${Math.max(3, (g.valueB / max) * 100)}%`, background: "linear-gradient(180deg, #fbbf4a, #f59e0b)" }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {groups.length > 1 && (
        <div className="flex justify-between gap-2.5">
          {groups.map((g) => (
            <span key={g.key} className="flex-1 flex items-center justify-center gap-1 text-center text-xs font-semibold text-white">
              {g.icon} {g.label}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function KpiCompareCard({ icon, title, valueA, valueB, formatValue }: { icon: string; title: string; valueA: number; valueB: number; formatValue: (n: number) => string }) {
  const delta = growth(valueA, valueB);
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="nord-card p-4">
      <p className="text-xs font-medium text-white mb-3">
        {icon} {title}
      </p>
      <Legend />
      <GroupedBars groups={[{ key: "kpi", label: title, valueA, valueB }]} formatValue={formatValue} />
      {delta !== null && (
        <span
          className={`inline-flex items-center gap-1 mt-3 px-2 py-0.5 rounded-full text-[11px] font-medium ${
            positive ? "bg-nord-success/15 text-nord-success" : "bg-nord-danger/15 text-nord-danger"
          }`}
        >
          {positive ? "▲" : "▼"} {formatPercent(Math.abs(delta))} de A sobre B
        </span>
      )}
    </div>
  );
}

function CompareByTypeCard({ icon, title, byType, formatValue }: { icon: string; title: string; byType: ByTypeRow[]; formatValue: (n: number) => string }) {
  return (
    <div className="nord-card p-4">
      <p className="text-xs font-medium text-white mb-3 truncate">
        {icon} {title}
      </p>
      <Legend />
      <GroupedBars
        groups={byType.map((t) => ({ key: t.type, label: SALE_TYPE_LABEL[t.type], icon: TYPE_ICON[t.type], valueA: t.valorA, valueB: t.valorB }))}
        formatValue={formatValue}
      />
    </div>
  );
}

export function AcompanhamentoClient({ initialResult, initialFilters }: { initialResult: Result; initialFilters: Filters }) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [result, setResult] = useState<Result>(initialResult);
  const [loading, setLoading] = useState(false);

  async function reload(next: Filters) {
    if (!next.fromA || !next.toA || !next.fromB || !next.toB) return;
    setLoading(true);
    const params = new URLSearchParams({ fromA: next.fromA, toA: next.toA, fromB: next.fromB, toB: next.toB });
    if (next.turno) params.set("turno", next.turno);
    if (next.platform) params.set("platform", next.platform);
    const res = await fetch(`/api/vendas/acompanhamento?${params.toString()}`);
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  function updateFilter(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    reload(next);
  }

  async function handleExport() {
    const { exportComparisonReportToPdf } = await import("@/lib/pdf-export");

    exportComparisonReportToPdf(
      "Acompanhamento de Vendas",
      `Data A: ${filters.fromA} a ${filters.toA}  vs  Data B: ${filters.fromB} a ${filters.toB}`,
      "Data A",
      "Data B",
      [
        {
          title: "KPIs gerais",
          chart: {
            groups: [
              { label: "Faturamento", valueA: result.kpis.faturamentoA, valueB: result.kpis.faturamentoB, formatValue: formatCurrency },
              { label: "Pedidos", valueA: result.kpis.pedidosA, valueB: result.kpis.pedidosB, formatValue: formatNumber },
              { label: "Ticket médio", valueA: result.kpis.ticketMedioA, valueB: result.kpis.ticketMedioB, formatValue: formatCurrency },
            ],
          },
          tableHead: ["Métrica", "Data A", "Data B"],
          tableRows: [
            ["Faturamento", formatCurrency(result.kpis.faturamentoA), formatCurrency(result.kpis.faturamentoB)],
            ["Pedidos", formatNumber(result.kpis.pedidosA), formatNumber(result.kpis.pedidosB)],
            ["Ticket médio", formatCurrency(result.kpis.ticketMedioA), formatCurrency(result.kpis.ticketMedioB)],
          ],
        },
        {
          title: "Pedidos por tipo de venda",
          chart: {
            groups: result.byType.map((t) => ({ label: SALE_TYPE_LABEL[t.type], valueA: t.pedidosA, valueB: t.pedidosB, formatValue: formatNumber })),
          },
          tableHead: ["Tipo de venda", "Pedidos A", "Pedidos B"],
          tableRows: result.byType.map((t) => [SALE_TYPE_LABEL[t.type], formatNumber(t.pedidosA), formatNumber(t.pedidosB)]),
        },
        {
          title: "Valor de venda por tipo de venda",
          chart: {
            // formatCompactCurrency (sem centavos) — com formatCurrency completo os rótulos se sobrepõem
            // nesse layout de 4 colunas lado a lado, mesmo motivo pelo qual a tela já usa a versão compacta
            // nos cards de comparação por tipo de venda (ver CompareByTypeCard).
            groups: result.byType.map((t) => ({ label: SALE_TYPE_LABEL[t.type], valueA: t.valorA, valueB: t.valorB, formatValue: formatCompactCurrency })),
          },
          tableHead: ["Tipo de venda", "Valor A", "Valor B"],
          tableRows: result.byType.map((t) => [SALE_TYPE_LABEL[t.type], formatCurrency(t.valorA), formatCurrency(t.valorB)]),
        },
        {
          title: "Ticket médio por tipo de venda",
          chart: {
            // Mesmo motivo acima: formatCompactCurrency evita sobreposição dos rótulos no gráfico de 4 colunas.
            groups: result.byType.map((t) => ({ label: SALE_TYPE_LABEL[t.type], valueA: t.ticketA, valueB: t.ticketB, formatValue: formatCompactCurrency })),
          },
          tableHead: ["Tipo de venda", "Ticket médio A", "Ticket médio B"],
          tableRows: result.byType.map((t) => [SALE_TYPE_LABEL[t.type], formatCurrency(t.ticketA), formatCurrency(t.ticketB)]),
        },
      ]
    );
  }

  const kpiItems = [
    { key: "faturamento", content: <KpiCompareCard icon="💰" title="Faturamento" valueA={result.kpis.faturamentoA} valueB={result.kpis.faturamentoB} formatValue={formatCurrency} /> },
    { key: "pedidos", content: <KpiCompareCard icon="📦" title="Pedidos" valueA={result.kpis.pedidosA} valueB={result.kpis.pedidosB} formatValue={(n) => formatNumber(n)} /> },
    { key: "ticket-medio", content: <KpiCompareCard icon="🧾" title="Ticket médio" valueA={result.kpis.ticketMedioA} valueB={result.kpis.ticketMedioB} formatValue={formatCurrency} /> },
  ];

  const compareItems = [
    { key: "pedidos-por-tipo", content: <CompareByTypeCard icon="📦" title="Quantidade de pedidos por tipo de venda" byType={result.byType.map((t) => ({ ...t, valorA: t.pedidosA, valorB: t.pedidosB }))} formatValue={(n) => formatNumber(n)} /> },
    { key: "valor-por-tipo", content: <CompareByTypeCard icon="💰" title="Valor de venda por tipo de venda" byType={result.byType} formatValue={formatCompactCurrency} /> },
    { key: "ticket-por-tipo", content: <CompareByTypeCard icon="🧾" title="Ticket médio por tipo de venda" byType={result.byType.map((t) => ({ ...t, valorA: t.ticketA, valorB: t.ticketB }))} formatValue={formatCompactCurrency} /> },
    { key: "comparativo-pedidos", content: <CompareByTypeCard icon="📦" title="Comparativo por quantidade de pedido entre períodos" byType={result.byType.map((t) => ({ ...t, valorA: t.pedidosA, valorB: t.pedidosB }))} formatValue={(n) => formatNumber(n)} /> },
    { key: "comparativo-valor", content: <CompareByTypeCard icon="💰" title="Comparativo de valor de venda entre períodos" byType={result.byType} formatValue={formatCompactCurrency} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="nord-card p-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-end gap-2">
              <label className="block">
                <span className="block text-[10px] text-nord-blue-light mb-1">Data A Inicial</span>
                <input type="date" value={filters.fromA} onChange={(e) => updateFilter({ fromA: e.target.value })} className="input !w-auto" />
              </label>
              <label className="block">
                <span className="block text-[10px] text-nord-blue-light mb-1">Data A Final</span>
                <input type="date" value={filters.toA} onChange={(e) => updateFilter({ toA: e.target.value })} className="input !w-auto" />
              </label>
            </div>
            <span className="text-xs font-bold text-nord-gray pb-2">vs</span>
            <div className="flex items-end gap-2">
              <label className="block">
                <span className="block text-[10px] text-nord-warning mb-1">Data B Inicial</span>
                <input type="date" value={filters.fromB} onChange={(e) => updateFilter({ fromB: e.target.value })} className="input !w-auto" />
              </label>
              <label className="block">
                <span className="block text-[10px] text-nord-warning mb-1">Data B Final</span>
                <input type="date" value={filters.toB} onChange={(e) => updateFilter({ toB: e.target.value })} className="input !w-auto" />
              </label>
            </div>
            <label className="block">
              <span className="block text-[10px] text-nord-gray mb-1">Turno</span>
              <select value={filters.turno} onChange={(e) => updateFilter({ turno: e.target.value as Turno | "" })} className="input !w-auto">
                <option value="">Todos os turnos</option>
                <option value="ALMOCO">{TURNO_LABEL.ALMOCO} (até 17h)</option>
                <option value="JANTAR">{TURNO_LABEL.JANTAR} (após 17h)</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] text-nord-gray mb-1">Plataforma</span>
              <select value={filters.platform} onChange={(e) => updateFilter({ platform: e.target.value as SalePlatform | "" })} className="input !w-auto">
                <option value="">Todas</option>
                {Object.entries(SALE_PLATFORM_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={handleExport}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium shrink-0"
          >
            <Download size={13} /> Exportar relatório
          </button>
        </div>
        <p className="text-xs text-nord-gray mt-3">
          Comparando <strong className="text-nord-blue-light">Data A: {filters.fromA} a {filters.toA}</strong> vs{" "}
          <strong className="text-nord-warning">Data B: {filters.fromB} a {filters.toB}</strong>
          {loading ? " · atualizando..." : ""}
        </p>
      </div>

      <Section title="KPIs gerais">
        <SortableCardGrid storageKey="vendas-acompanhamento-kpi-order" className="grid grid-cols-1 md:grid-cols-3 gap-4" items={kpiItems} />
      </Section>

      <Section title="Comparação por tipo de venda">
        <SortableCardGrid storageKey="vendas-acompanhamento-compare-order" className="grid grid-cols-1 md:grid-cols-3 gap-4" items={compareItems} />
      </Section>

    </div>
  );
}
