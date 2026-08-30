"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pencil } from "lucide-react";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { formatCurrency, formatPercent, growth } from "@/lib/calc";
import { format } from "date-fns";
import type { PeriodKey } from "@/lib/periods";
import { SALE_CHANNEL_LABEL, SALE_PLATFORM_LABEL } from "@/lib/vendas-analytics";
import { FaturamentoComparisonChart } from "./chart";
import { HoraCard, PagamentoCard, EntregaCard } from "./mini-cards";
import type { SaleChannel, SalePlatform } from "@prisma/client";

const PERIOD_CHIPS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "mes", label: "Mês atual" },
  { key: "mes-anterior", label: "Mês passado" },
  { key: "personalizado", label: "Personalizado" },
];

const CHANNEL_CHIPS: { key: SaleChannel | ""; label: string }[] = [
  { key: "", label: "Todos" },
  { key: "SALAO", label: SALE_CHANNEL_LABEL.SALAO },
  { key: "DELIVERY", label: SALE_CHANNEL_LABEL.DELIVERY },
  { key: "BALCAO", label: "Retirada" },
];

const PLATFORM_CHIPS: { key: SalePlatform | ""; label: string }[] = [
  { key: "", label: "Todas" },
  { key: "SITE_PROPRIO", label: SALE_PLATFORM_LABEL.SITE_PROPRIO },
  { key: "IFOOD", label: SALE_PLATFORM_LABEL.IFOOD },
  { key: "FOOD99", label: SALE_PLATFORM_LABEL.FOOD99 },
];

type Summary = {
  kpis: {
    faturamentoAtual: number;
    faturamentoAnterior: number;
    pedidosAtual: number;
    pedidosAnterior: number;
    ticketMedioAtual: number;
    ticketMedioAnterior: number;
    canalLider: { channel: string | null; label: string; percent: number };
  };
  chartData: { dia: number; atual: number; anterior: number }[];
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
};

type MiniInitialData = {
  porHora: Parameters<typeof HoraCard>[0]["initialData"];
  pagamento: Parameters<typeof PagamentoCard>[0]["initialData"];
  entrega: Parameters<typeof EntregaCard>[0]["initialData"];
};

export function FaturamentoClient({
  initialSummary,
  initialPorHora,
  initialPagamento,
  initialEntrega,
}: {
  initialSummary: Summary;
} & { initialPorHora: MiniInitialData["porHora"]; initialPagamento: MiniInitialData["pagamento"]; initialEntrega: MiniInitialData["entrega"] }) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("hoje");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [channel, setChannel] = useState<SaleChannel | "">("");
  const [platform, setPlatform] = useState<SalePlatform | "">("");
  const [compareMode, setCompareMode] = useState<"corrido" | "mesmo-dia-semana">("corrido");
  const [compareOverride, setCompareOverride] = useState<{ from: string; to: string } | null>(null);
  const [editingCompare, setEditingCompare] = useState(false);
  const [compareFromInput, setCompareFromInput] = useState("");
  const [compareToInput, setCompareToInput] = useState("");
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (periodKey === "personalizado" && (!customFrom || !customTo)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetches summary whenever a filter changes
    setLoading(true);
    const params = new URLSearchParams({ key: periodKey, compareMode });
    if (periodKey === "personalizado") {
      params.set("from", customFrom);
      params.set("to", customTo);
    }
    if (channel) params.set("channel", channel);
    if (platform) params.set("platform", platform);
    if (compareOverride) {
      params.set("compareFrom", compareOverride.from);
      params.set("compareTo", compareOverride.to);
    }
    fetch(`/api/vendas/faturamento?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setSummary(data))
      .finally(() => setLoading(false));
  }, [periodKey, customFrom, customTo, channel, platform, compareMode, compareOverride]);

  // Atualiza os KPIs periodicamente para refletir novas vendas sincronizadas
  // da Saipos sem exigir que o usuário recarregue a página.
  useEffect(() => {
    const interval = setInterval(() => {
      if (periodKey === "personalizado" && (!customFrom || !customTo)) return;
      const params = new URLSearchParams({ key: periodKey, compareMode });
      if (periodKey === "personalizado") {
        params.set("from", customFrom);
        params.set("to", customTo);
      }
      if (channel) params.set("channel", channel);
      if (platform) params.set("platform", platform);
      if (compareOverride) {
        params.set("compareFrom", compareOverride.from);
        params.set("compareTo", compareOverride.to);
      }
      fetch(`/api/vendas/faturamento?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => setSummary(data))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, [periodKey, customFrom, customTo, channel, platform, compareMode, compareOverride]);

  function applyCompareOverride() {
    if (!compareFromInput || !compareToInput) return;
    setCompareOverride({ from: compareFromInput, to: compareToInput });
    setEditingCompare(false);
  }

  function clearCompareOverride() {
    setCompareOverride(null);
    setEditingCompare(false);
  }

  async function handleExport() {
    const { exportKpiReportToPdf } = await import("@/lib/pdf-export");
    exportKpiReportToPdf(
      "Faturamento",
      `${format(new Date(summary.from), "dd/MM/yyyy")} a ${format(new Date(summary.to), "dd/MM/yyyy")}`,
      [
        {
          title: "KPIs do período",
          rows: [
            ["Faturamento total", formatCurrency(summary.kpis.faturamentoAtual)],
            ["Ticket médio", formatCurrency(summary.kpis.ticketMedioAtual)],
            ["Pedidos", String(summary.kpis.pedidosAtual)],
            ["Canal líder", `${summary.kpis.canalLider.label} (${formatPercent(summary.kpis.canalLider.percent)})`],
          ],
        },
        {
          title: "Comparação com período anterior",
          rows: [
            ["Faturamento anterior", formatCurrency(summary.kpis.faturamentoAnterior)],
            ["Pedidos anterior", String(summary.kpis.pedidosAnterior)],
          ],
        },
      ]
    );
  }

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

      <div className="nord-card p-4 space-y-4">
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-nord-gray mb-1.5">Período</p>
            <div className="flex flex-wrap gap-1.5">
              {PERIOD_CHIPS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setPeriodKey(c.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    periodKey === c.key ? "bg-nord-blue text-white" : "border border-nord-border text-nord-gray hover:text-white"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {periodKey === "personalizado" && (
              <div className="flex items-center gap-2 mt-2">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input !w-auto" />
                <span className="text-xs text-nord-gray">até</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input !w-auto" />
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-nord-gray mb-1.5">Canal de venda</p>
            <div className="flex flex-wrap gap-1.5">
              {CHANNEL_CHIPS.map((c) => (
                <button
                  key={c.key || "todos"}
                  onClick={() => setChannel(c.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    channel === c.key ? "bg-nord-blue text-white" : "border border-nord-border text-nord-gray hover:text-white"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-nord-gray mb-1.5">Plataforma</p>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORM_CHIPS.map((c) => (
                <button
                  key={c.key || "todas"}
                  onClick={() => setPlatform(c.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    platform === c.key ? "bg-nord-blue text-white" : "border border-nord-border text-nord-gray hover:text-white"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Faturamento total"
          value={formatCurrency(summary.kpis.faturamentoAtual)}
          icon="DollarSign"
          color="#3b82f6"
          delta={growth(summary.kpis.faturamentoAtual, summary.kpis.faturamentoAnterior)}
        />
        <StatCard
          label="Ticket médio"
          value={formatCurrency(summary.kpis.ticketMedioAtual)}
          icon="Receipt"
          color="#22c55e"
          delta={growth(summary.kpis.ticketMedioAtual, summary.kpis.ticketMedioAnterior)}
        />
        <StatCard
          label="Pedidos"
          value={String(summary.kpis.pedidosAtual)}
          icon="Package"
          color="#f59e0b"
          delta={growth(summary.kpis.pedidosAtual, summary.kpis.pedidosAnterior)}
        />
        <StatCard
          label="Canal líder"
          value={summary.kpis.canalLider.label}
          icon="TrendingUp"
          color="#ef4444"
          hint={`${formatPercent(summary.kpis.canalLider.percent)} do faturamento`}
        />
      </div>

      <Section
        title={loading ? "Atualizando..." : "Comparativo entre 2 períodos"}
        action={
          <div className="flex items-center gap-2">
            <Badge tone="info">Período A: {format(new Date(summary.from), "dd/MM")} a {format(new Date(summary.to), "dd/MM")}</Badge>
            <span className="text-xs text-nord-gray">vs</span>
            <button
              onClick={() => {
                setCompareFromInput(compareOverride?.from ?? format(new Date(summary.prevFrom), "yyyy-MM-dd"));
                setCompareToInput(compareOverride?.to ?? format(new Date(summary.prevTo), "yyyy-MM-dd"));
                setEditingCompare((v) => !v);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-nord-warning/15 text-nord-warning hover:opacity-80"
            >
              Período B: {format(new Date(summary.prevFrom), "dd/MM")} a {format(new Date(summary.prevTo), "dd/MM")} <Pencil size={10} />
            </button>
          </div>
        }
      >
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setCompareMode("corrido")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${compareMode === "corrido" ? "bg-nord-blue/15 text-nord-blue-light" : "border border-nord-border text-nord-gray hover:text-white"}`}
          >
            Período corrido
          </button>
          <button
            onClick={() => setCompareMode("mesmo-dia-semana")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${compareMode === "mesmo-dia-semana" ? "bg-nord-blue/15 text-nord-blue-light" : "border border-nord-border text-nord-gray hover:text-white"}`}
          >
            Mesmo dia da semana
          </button>
        </div>

        {editingCompare && (
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-dashed border-nord-border">
            <input type="date" value={compareFromInput} onChange={(e) => setCompareFromInput(e.target.value)} className="input !w-auto" />
            <span className="text-xs text-nord-gray">até</span>
            <input type="date" value={compareToInput} onChange={(e) => setCompareToInput(e.target.value)} className="input !w-auto" />
            <button onClick={applyCompareOverride} className="px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium">
              Aplicar
            </button>
            {compareOverride && (
              <button onClick={clearCompareOverride} className="px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white">
                Usar automático
              </button>
            )}
          </div>
        )}

        <FaturamentoComparisonChart data={summary.chartData} />
        <div className="flex items-center gap-5 mt-2">
          <span className="flex items-center gap-1.5 text-xs text-nord-gray">
            <span className="w-3.5 h-0.5 rounded-full bg-[#3b82f6] inline-block" /> Período atual — {formatCurrency(summary.kpis.faturamentoAtual)}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-nord-gray">
            <span className="w-3.5 h-0.5 rounded-full bg-[#f59e0b] inline-block" /> Período de comparação — {formatCurrency(summary.kpis.faturamentoAnterior)}
          </span>
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HoraCard initialData={initialPorHora} channel={channel || undefined} platform={platform || undefined} />
        <PagamentoCard initialData={initialPagamento} channel={channel || undefined} platform={platform || undefined} />
        <EntregaCard initialData={initialEntrega} platform={platform || undefined} />
      </div>

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
