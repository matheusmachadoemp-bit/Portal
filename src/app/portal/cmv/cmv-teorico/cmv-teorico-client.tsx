"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, LabelList } from "recharts";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { renderPercentBarLabel } from "@/components/ui/percent-bar-label";
import { formatCurrency, formatPercent } from "@/lib/calc";
import { listClosedWeeks, listClosedMonths, type ClosedPeriodMode } from "@/lib/closed-period-filter";

type CmvTeoricoData = {
  faturamentoPeriodo: number;
  custoTeoricoTotal: number;
  cmvTeoricoPercent: number;
  categoriaChart: { name: string; value: number; produtos: number }[];
  produtosMaiorImpacto: { id: string; name: string; cmv: number; custo: number; precoVenda: number }[];
  produtosSemFicha: { id: string; name: string }[];
};

export function CmvTeoricoClient({
  faturamentoPeriodo,
  custoTeoricoTotal,
  cmvTeoricoPercent,
  metaCmvPercent,
  categoriaChart,
  produtosMaiorImpacto,
  produtosSemFicha,
  initialMode,
  initialKey,
  initialLabel,
}: CmvTeoricoData & {
  metaCmvPercent: number;
  initialMode: ClosedPeriodMode;
  initialKey: string;
  initialLabel: string;
}) {
  const [mode, setMode] = useState<ClosedPeriodMode>(initialMode);
  const [key, setKey] = useState(initialKey);
  const [periodLabel, setPeriodLabel] = useState(initialLabel);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CmvTeoricoData>({
    faturamentoPeriodo,
    custoTeoricoTotal,
    cmvTeoricoPercent,
    categoriaChart,
    produtosMaiorImpacto,
    produtosSemFicha,
  });

  const options = mode === "semana" ? listClosedWeeks() : listClosedMonths();
  const diferenca = data.cmvTeoricoPercent - metaCmvPercent;

  async function applyPeriod(newMode: ClosedPeriodMode, newKey: string) {
    setMode(newMode);
    setKey(newKey);
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode: newMode, key: newKey });
      const res = await fetch(`/api/cmv/teorico?${params.toString()}`);
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

      <p className="text-xs text-nord-gray bg-nord-panel border border-nord-border rounded-lg px-3 py-2">
        CMV Teórico = soma do custo de cada ficha técnica ponderado pelas vendas do catálogo, dividido pelo faturamento do
        período. Sem o registro de vendas por item individual, o cálculo assume peso igual entre os produtos com preço de
        venda cadastrado (aproximação por catálogo).
      </p>

      <SortableStatCards
        storageKey="estoque-cmv-teorico-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "faturamento-periodo", label: `Faturamento (${periodLabel})`, value: formatCurrency(data.faturamentoPeriodo), icon: "DollarSign" },
          { key: "custo-teorico-total", label: "Custo teórico total", value: formatCurrency(data.custoTeoricoTotal), icon: "Calculator", color: "#2952E3" },
          { key: "cmv-teorico-percent", label: "CMV Teórico %", value: formatPercent(data.cmvTeoricoPercent), icon: "Percent" },
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

      <Section title="Custo teórico por categoria">
        <ResponsiveContainer width="100%" height={Math.max(160, data.categoriaChart.length * 36)}>
          <BarChart data={data.categoriaChart} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--nord-border)" />
            <XAxis type="number" stroke="var(--nord-gray)" fontSize={11} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" stroke="var(--nord-gray)" fontSize={11} width={140} />
            <Tooltip contentStyle={{ background: "var(--nord-card)", border: "1px solid var(--nord-border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => `${v}%`} />
            <Bar dataKey="value" fill="#2952E3" radius={[0, 6, 6, 0]}>
              <LabelList dataKey="value" content={renderPercentBarLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      <Section title={`Produtos com CMV acima da meta (${data.produtosMaiorImpacto.length})`}>
        <div className="space-y-1.5">
          {data.produtosMaiorImpacto.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 py-1.5 last:border-0">
              <span className="text-white">{p.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-nord-gray">{formatCurrency(p.custo)} / {formatCurrency(p.precoVenda)}</span>
                <Badge tone={p.cmv > metaCmvPercent * 1.5 ? "danger" : "warning"}>{formatPercent(p.cmv)}</Badge>
              </span>
            </div>
          ))}
          {data.produtosMaiorImpacto.length === 0 && (
            <p className="text-sm text-nord-gray text-center py-4">Nenhum produto com CMV acima da meta ({formatPercent(metaCmvPercent)}).</p>
          )}
        </div>
      </Section>

      {data.produtosSemFicha.length > 0 && (
        <Section title="Produtos vendidos sem ficha técnica">
          <div className="space-y-1.5">
            {data.produtosSemFicha.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 py-1.5 last:border-0">
                <span className="text-white">{p.name}</span>
                <Badge tone="danger">Sem ficha</Badge>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
