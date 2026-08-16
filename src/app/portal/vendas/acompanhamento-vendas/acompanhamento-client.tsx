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
    const { exportKpiReportToPdf } = await import("@/lib/pdf-export");
    exportKpiReportToPdf("Acompanhamento de Vendas", `Data A: ${filters.fromA} a ${filters.toA} vs Data B: ${filters.fromB} a ${filters.toB}`, [
      {
        title: "KPIs gerais (A vs B)",
        rows: [
          ["Faturamento", `${formatCurrency(result.kpis.faturamentoA)} vs ${formatCurrency(result.kpis.faturamentoB)}`],
          ["Pedidos", `${result.kpis.pedidosA} vs ${result.kpis.pedidosB}`],
          ["Ticket médio", `${formatCurrency(result.kpis.ticketMedioA)} vs ${formatCurrency(result.kpis.ticketMedioB)}`],
        ],
      },
      {
        title: "Por tipo de venda (A vs B)",
        rows: result.byType.map((t) => [SALE_TYPE_LABEL[t.type], `${t.pedidosA} pedidos / ${formatCurrency(t.valorA)} vs ${t.pedidosB} pedidos / ${formatCurrency(t.valorB)}`]),
      },
    ]);
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
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
        >
          <Download size={13} /> Exportar relatório
        </button>
      </div>

      <div className="nord-card p-4">
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

      <style jsx global>{`
        .input {
          background: var(--nord-panel);
          border: 1px solid var(--nord-border);
          border-radius: 8px;
          padding: 8px 12px;
          color: white;
          font-size: 13px;
          outline: none;
        }
        .input:focus {
          border-color: var(--nord-blue);
        }
      `}</style>
    </div>
  );
}
