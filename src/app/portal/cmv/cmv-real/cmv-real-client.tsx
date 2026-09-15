"use client";

import { useState } from "react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { formatCurrency, formatPercent } from "@/lib/calc";
import { listClosedWeeks, listClosedMonths, type ClosedPeriodMode } from "@/lib/closed-period-filter";

type Criterio = "TOTAL" | "SALAO" | "DELIVERY";

type CmvRealData = {
  estoqueInicial: number;
  compras: number;
  transferenciasRecebidas: number;
  transferenciasEnviadas: number;
  devolucoes: number;
  ajustes: number;
  perdas: number;
  estoqueFinal: number;
  custoConsumido: number;
  faturamentoDelivery: number;
  faturamentoSalao: number;
};

export function CmvRealClient({
  estoqueInicial,
  compras,
  transferenciasRecebidas,
  transferenciasEnviadas,
  devolucoes,
  ajustes,
  perdas,
  estoqueFinal,
  custoConsumido,
  faturamentoDelivery,
  faturamentoSalao,
  metaCmvPercent,
  initialMode,
  initialKey,
  initialLabel,
}: CmvRealData & {
  metaCmvPercent: number;
  initialMode: ClosedPeriodMode;
  initialKey: string;
  initialLabel: string;
}) {
  const [criterio, setCriterio] = useState<Criterio>("TOTAL");
  const [mode, setMode] = useState<ClosedPeriodMode>(initialMode);
  const [key, setKey] = useState(initialKey);
  const [periodLabel, setPeriodLabel] = useState(initialLabel);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CmvRealData>({
    estoqueInicial,
    compras,
    transferenciasRecebidas,
    transferenciasEnviadas,
    devolucoes,
    ajustes,
    perdas,
    estoqueFinal,
    custoConsumido,
    faturamentoDelivery,
    faturamentoSalao,
  });

  const options = mode === "semana" ? listClosedWeeks() : listClosedMonths();

  async function applyPeriod(newMode: ClosedPeriodMode, newKey: string) {
    setMode(newMode);
    setKey(newKey);
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode: newMode, key: newKey });
      const res = await fetch(`/api/cmv/real?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
      const opts = newMode === "semana" ? listClosedWeeks() : listClosedMonths();
      setPeriodLabel(opts.find((o) => o.key === newKey)?.label ?? "");
    } finally {
      setLoading(false);
    }
  }

  function handleModeChange(newMode: ClosedPeriodMode) {
    const opts = newMode === "semana" ? listClosedWeeks() : listClosedMonths();
    applyPeriod(newMode, opts[0].key);
  }

  const faturamento =
    criterio === "TOTAL" ? data.faturamentoDelivery + data.faturamentoSalao : criterio === "SALAO" ? data.faturamentoSalao : data.faturamentoDelivery;
  const cmvRealPercent = faturamento ? (data.custoConsumido / faturamento) * 100 : 0;
  const diferenca = cmvRealPercent - metaCmvPercent;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {(["mes", "semana"] as ClosedPeriodMode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${mode === m ? "bg-nord-blue text-white" : "border border-nord-border text-nord-gray hover:text-white"}`}
            >
              {m === "mes" ? "Mês fechado" : "Semana fechada"}
            </button>
          ))}
        </div>
        <select
          value={key}
          onChange={(e) => applyPeriod(mode, e.target.value)}
          disabled={loading}
          className="bg-nord-panel border border-nord-border rounded-lg px-3 py-1.5 text-xs text-white"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        {loading && <span className="text-xs text-nord-gray animate-pulse">Atualizando...</span>}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-nord-gray">Faturamento considerado no cálculo:</span>
        {(["TOTAL", "SALAO", "DELIVERY"] as Criterio[]).map((c) => (
          <button
            key={c}
            onClick={() => setCriterio(c)}
            className={`px-3 py-1 rounded-lg text-xs font-medium ${criterio === c ? "bg-nord-blue text-white" : "border border-nord-border text-nord-gray hover:text-white"}`}
          >
            {c === "TOTAL" ? "Salão + Delivery" : c === "SALAO" ? "Somente Salão" : "Somente Delivery"}
          </button>
        ))}
      </div>

      <SortableStatCards
        storageKey="estoque-cmv-real-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "faturamento-periodo", label: `Faturamento (${periodLabel})`, value: formatCurrency(faturamento), icon: "DollarSign" },
          { key: "custo-consumido", label: "Custo consumido", value: formatCurrency(data.custoConsumido), icon: "Warehouse", color: "#eab308" },
          { key: "cmv-real-percent", label: "CMV Real %", value: formatPercent(cmvRealPercent), icon: "Percent", color: diferenca > 0 ? "#ef4444" : "#22c55e" },
          {
            key: "diferenca-meta",
            label: "Diferença para a meta",
            value: `${diferenca >= 0 ? "+" : ""}${diferenca.toFixed(1)} p.p.`,
            icon: diferenca > 0 ? "TriangleAlert" : "CheckCircle2",
            color: diferenca > 0 ? "#ef4444" : "#22c55e",
            hint: `Meta: ${formatPercent(metaCmvPercent)}`,
          },
        ]}
      />

      <Section title="Composição do CMV Real">
        <div className="space-y-2 text-sm">
          {[
            { label: "Estoque inicial", value: data.estoqueInicial },
            { label: "(+) Compras", value: data.compras },
            { label: "(+) Transferências recebidas", value: data.transferenciasRecebidas },
            { label: "(−) Transferências enviadas", value: -data.transferenciasEnviadas },
            { label: "(−) Devoluções ao fornecedor", value: -data.devolucoes },
            { label: "(+/−) Ajustes", value: data.ajustes },
            { label: "(−) Estoque final", value: -data.estoqueFinal },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between border-b border-nord-border/60 pb-2 last:border-0">
              <span className="text-nord-gray">{row.label}</span>
              <span className={row.value < 0 ? "text-nord-danger" : "text-white"}>{formatCurrency(row.value)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 font-medium">
            <span className="text-white">Custo consumido (CMV Real em R$)</span>
            <span className="text-white">{formatCurrency(data.custoConsumido)}</span>
          </div>
        </div>
      </Section>

      <Section title="Perdas registradas no período (referência)">
        <div className="flex items-center justify-between text-sm">
          <span className="text-nord-gray">Perdas e desperdícios (já refletidas no estoque final)</span>
          <Badge tone="danger">{formatCurrency(data.perdas)}</Badge>
        </div>
      </Section>
    </div>
  );
}
