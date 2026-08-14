"use client";

import { useState } from "react";
import { Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { formatCurrency, growth } from "@/lib/calc";
import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/periods";

type Summary = { faturamento: number; pedidos: number; ticketMedio: number };

export function PeriodoClient({
  initialKey,
  initialAtual,
  initialAnterior,
}: {
  initialKey: PeriodKey;
  initialAtual: Summary;
  initialAnterior: Summary;
}) {
  const [key, setKey] = useState<PeriodKey>(initialKey);
  const [atual, setAtual] = useState(initialAtual);
  const [anterior, setAnterior] = useState(initialAnterior);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadPeriod(newKey: PeriodKey, from?: string, to?: string) {
    setLoading(true);
    const params = new URLSearchParams({ key: newKey });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/vendas/periodo?${params.toString()}`);
    const data = await res.json();
    setAtual(data.atual);
    setAnterior(data.anterior);
    setLoading(false);
  }

  function selectPeriod(newKey: PeriodKey) {
    setKey(newKey);
    if (newKey !== "personalizado") loadPeriod(newKey);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => selectPeriod(opt.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${key === opt.key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {key === "personalizado" && (
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white" />
          <span className="text-nord-gray text-xs">até</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white" />
          <button
            onClick={() => loadPeriod("personalizado", customFrom, customTo)}
            disabled={!customFrom || !customTo}
            className="px-3 py-2 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
          >
            Aplicar
          </button>
        </div>
      )}

      <Section title={loading ? "Carregando..." : "Período atual x período anterior"}>
        <SortableStatCards
          storageKey="vendas-periodo-kpi-order"
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
          cards={[
            { key: "faturamento", label: "Faturamento", value: formatCurrency(atual.faturamento), icon: "DollarSign", delta: growth(atual.faturamento, anterior.faturamento) },
            { key: "pedidos", label: "Pedidos", value: String(atual.pedidos), icon: "ShoppingCart", delta: growth(atual.pedidos, anterior.pedidos) },
            { key: "ticket-medio", label: "Ticket médio", value: formatCurrency(atual.ticketMedio), icon: "Receipt", delta: growth(atual.ticketMedio, anterior.ticketMedio) },
          ]}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 opacity-70">
          <p className="text-xs text-nord-gray">Faturamento anterior: {formatCurrency(anterior.faturamento)}</p>
          <p className="text-xs text-nord-gray">Pedidos anterior: {anterior.pedidos}</p>
          <p className="text-xs text-nord-gray">Ticket médio anterior: {formatCurrency(anterior.ticketMedio)}</p>
        </div>
      </Section>
    </div>
  );
}
