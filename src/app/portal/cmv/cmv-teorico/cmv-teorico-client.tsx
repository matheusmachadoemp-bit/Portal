"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { formatCurrency, formatPercent } from "@/lib/calc";

export function CmvTeoricoClient({
  faturamentoPeriodo,
  custoTeoricoTotal,
  cmvTeoricoPercent,
  metaCmvPercent,
  categoriaChart,
  produtosMaiorImpacto,
  produtosSemFicha,
  periodDays,
}: {
  faturamentoPeriodo: number;
  custoTeoricoTotal: number;
  cmvTeoricoPercent: number;
  metaCmvPercent: number;
  categoriaChart: { name: string; value: number; produtos: number }[];
  produtosMaiorImpacto: { id: string; name: string; cmv: number; custo: number; precoVenda: number }[];
  produtosSemFicha: { id: string; name: string }[];
  periodDays: number;
}) {
  const diferenca = cmvTeoricoPercent - metaCmvPercent;

  return (
    <div className="space-y-6">
      <p className="text-xs text-nord-gray bg-nord-panel border border-nord-border rounded-lg px-3 py-2">
        CMV Teórico = soma do custo de cada ficha técnica ponderado pelas vendas do catálogo, dividido pelo faturamento do
        período. Sem o registro de vendas por item individual, o cálculo assume peso igual entre os produtos com preço de
        venda cadastrado (aproximação por catálogo).
      </p>

      <SortableStatCards
        storageKey="estoque-cmv-teorico-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "faturamento-periodo", label: `Faturamento (${periodDays}d)`, value: formatCurrency(faturamentoPeriodo), icon: "DollarSign" },
          { key: "custo-teorico-total", label: "Custo teórico total", value: formatCurrency(custoTeoricoTotal), icon: "Calculator", color: "#2952E3" },
          { key: "cmv-teorico-percent", label: "CMV Teórico %", value: formatPercent(cmvTeoricoPercent), icon: "Percent" },
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
        <ResponsiveContainer width="100%" height={Math.max(160, categoriaChart.length * 36)}>
          <BarChart data={categoriaChart} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--nord-border)" />
            <XAxis type="number" stroke="var(--nord-gray)" fontSize={11} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" stroke="var(--nord-gray)" fontSize={11} width={140} />
            <Tooltip contentStyle={{ background: "var(--nord-card)", border: "1px solid var(--nord-border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => `${v}%`} />
            <Bar dataKey="value" fill="#2952E3" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Produtos com maior impacto no CMV">
        <div className="space-y-1.5">
          {produtosMaiorImpacto.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 py-1.5 last:border-0">
              <span className="text-white">{p.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-nord-gray">{formatCurrency(p.custo)} / {formatCurrency(p.precoVenda)}</span>
                <Badge tone={p.cmv > 35 ? "danger" : p.cmv > 28 ? "warning" : "success"}>{formatPercent(p.cmv)}</Badge>
              </span>
            </div>
          ))}
          {produtosMaiorImpacto.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Nenhum produto com preço de venda cadastrado.</p>}
        </div>
      </Section>

      {produtosSemFicha.length > 0 && (
        <Section title="Produtos vendidos sem ficha técnica">
          <div className="space-y-1.5">
            {produtosSemFicha.map((p) => (
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
