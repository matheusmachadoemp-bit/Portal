"use client";

import { useState } from "react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { formatCurrency, formatPercent } from "@/lib/calc";

type Criterio = "TOTAL" | "SALAO" | "DELIVERY";

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
  periodDays,
}: {
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
  metaCmvPercent: number;
  periodDays: number;
}) {
  const [criterio, setCriterio] = useState<Criterio>("TOTAL");
  const faturamento =
    criterio === "TOTAL" ? faturamentoDelivery + faturamentoSalao : criterio === "SALAO" ? faturamentoSalao : faturamentoDelivery;
  const cmvRealPercent = faturamento ? (custoConsumido / faturamento) * 100 : 0;
  const diferenca = cmvRealPercent - metaCmvPercent;

  return (
    <div className="space-y-6">
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
          { key: "faturamento-periodo", label: `Faturamento (${periodDays}d)`, value: formatCurrency(faturamento), icon: "DollarSign" },
          { key: "custo-consumido", label: "Custo consumido", value: formatCurrency(custoConsumido), icon: "Warehouse", color: "#eab308" },
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
            { label: "Estoque inicial", value: estoqueInicial },
            { label: "(+) Compras", value: compras },
            { label: "(+) Transferências recebidas", value: transferenciasRecebidas },
            { label: "(−) Transferências enviadas", value: -transferenciasEnviadas },
            { label: "(−) Devoluções ao fornecedor", value: -devolucoes },
            { label: "(+/−) Ajustes", value: ajustes },
            { label: "(−) Estoque final", value: -estoqueFinal },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between border-b border-nord-border/60 pb-2 last:border-0">
              <span className="text-nord-gray">{row.label}</span>
              <span className={row.value < 0 ? "text-red-400" : "text-white"}>{formatCurrency(row.value)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 font-medium">
            <span className="text-white">Custo consumido (CMV Real em R$)</span>
            <span className="text-white">{formatCurrency(custoConsumido)}</span>
          </div>
        </div>
      </Section>

      <Section title="Perdas registradas no período (referência)">
        <div className="flex items-center justify-between text-sm">
          <span className="text-nord-gray">Perdas e desperdícios (já refletidas no estoque final)</span>
          <Badge tone="danger">{formatCurrency(perdas)}</Badge>
        </div>
      </Section>
    </div>
  );
}
