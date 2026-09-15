"use client";

import { useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { PeriodFilterBar } from "@/components/ui/period-filter";
import { formatCurrency } from "@/lib/calc";
import { type RollingPeriodKey } from "@/lib/periods";
import type { ConsumoComparativoRow, IndicadoresData } from "@/lib/producao-indicadores-server";

export function IndicadoresClient({ initialData, consumoHoje }: { initialData: IndicadoresData; consumoHoje: ConsumoComparativoRow[] }) {
  const [data, setData] = useState(initialData);
  const [periodo, setPeriodo] = useState<RollingPeriodKey>("mes-atual");
  const [loading, setLoading] = useState(false);

  async function applyPeriodo(key: RollingPeriodKey, from?: string, to?: string) {
    setPeriodo(key);
    setLoading(true);
    try {
      const params = new URLSearchParams({ periodo: key });
      if (key === "personalizado" && from && to) {
        params.set("from", from);
        params.set("to", to);
      }
      const res = await fetch(`/api/producao/indicadores?${params.toString()}`);
      const json = await res.json();
      setData(json.data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <PeriodFilterBar periodo={periodo} onApply={applyPeriodo} loading={loading} />
        {loading && <span className="text-xs text-nord-gray mt-2 inline-block">Atualizando...</span>}
      </div>

      <SortableStatCards
        storageKey="producao-indicadores-kpi-order"
        cards={[
          { key: "precisao-media", label: "Precisão Média da Produção", value: `${data.precisaoMedia}%`, icon: "Target", color: "#22c55e" },
          { key: "no-prazo", label: "% Produções no Prazo", value: `${data.percentNoPrazo}%`, icon: "Clock", color: "#1464F4" },
          { key: "atrasadas", label: "Produções Atrasadas", value: String(data.producoesAtrasadas), icon: "AlertTriangle", color: "#ef4444" },
          { key: "desperdicio", label: "Desperdício Estimado", value: formatCurrency(data.desperdicioEstimado), icon: "Trash2", color: "#f97316" },
          {
            key: "excedente",
            label: "Produção Excedente",
            value: String(data.producaoExcedente.count),
            hint: formatCurrency(data.producaoExcedente.valorEstimado),
            icon: "TrendingUp",
            color: "#3b82f6",
          },
          { key: "insuficiente", label: "Produção Insuficiente", value: String(data.producaoInsuficiente.count), icon: "TrendingDown", color: "#eab308" },
        ]}
      />

      <Section title="Precisão da produção ao longo do tempo">
        {data.serieDiaria.length === 0 ? (
          <p className="text-sm text-nord-gray py-6 text-center">Ainda não há produções concluídas suficientes nesse período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.serieDiaria}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="date" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} formatter={(v) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="precisaoMedia" name="Precisão média" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Planejado x Produzido por dia">
        {data.serieDiaria.length === 0 ? (
          <p className="text-sm text-nord-gray py-6 text-center">Sem dados suficientes ainda.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.serieDiaria}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="date" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="planejado" name="Planejado" stroke="#2952E3" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="produzido" name="Produzido" stroke="#eab308" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Produção x Consumo (hoje)">
        <p className="text-xs text-nord-gray mb-3">
          Cruza o que foi produzido hoje com o consumo teórico estimado pela previsão de vendas. O saldo real só aparece
          depois que alguém registrar o &quot;saldo do turno anterior&quot; do dia seguinte.
        </p>
        {consumoHoje.length === 0 ? (
          <p className="text-sm text-nord-gray py-4 text-center">Nenhum item com ficha técnica ligada tem produção hoje.</p>
        ) : (
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3">Estoque inicial</th>
                  <th className="py-2 px-3">Produzido</th>
                  <th className="py-2 px-3">Disponível</th>
                  <th className="py-2 px-3">Consumo teórico</th>
                  <th className="py-2 px-3">Saldo esperado</th>
                  <th className="py-2 px-3">Saldo real</th>
                  <th className="py-2 px-3">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {consumoHoje.map((row) => (
                  <tr key={row.productionItemId} className="border-b border-nord-border/50">
                    <td className="py-2 px-3 text-white">{row.name}</td>
                    <td className="py-2 px-3 text-nord-gray">{row.estoqueInicial.toFixed(1)} {row.unidade}</td>
                    <td className="py-2 px-3 text-nord-gray">{row.produzido.toFixed(1)} {row.unidade}</td>
                    <td className="py-2 px-3 text-nord-gray">{row.disponivel.toFixed(1)} {row.unidade}</td>
                    <td className="py-2 px-3 text-nord-gray">{row.consumoTeorico.toFixed(1)} {row.unidade}</td>
                    <td className="py-2 px-3 text-white">{row.saldoEsperado.toFixed(1)} {row.unidade}</td>
                    <td className="py-2 px-3 text-nord-gray">{row.saldoReal !== null ? `${row.saldoReal.toFixed(1)} ${row.unidade}` : "—"}</td>
                    <td className="py-2 px-3">
                      {row.diferenca !== null ? (
                        <Badge tone={Math.abs(row.diferenca) > 0.5 ? "warning" : "success"}>
                          {row.diferenca > 0 ? "+" : ""}
                          {row.diferenca.toFixed(1)} {row.unidade}
                        </Badge>
                      ) : (
                        <span className="text-nord-gray">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Itens com maior variação">
          {data.itensComMaiorVariacao.length === 0 ? (
            <p className="text-sm text-nord-gray py-4 text-center">Sem dados suficientes ainda.</p>
          ) : (
            <div className="space-y-2">
              {data.itensComMaiorVariacao.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <span className="text-white">{item.name}</span>
                  <Badge tone={item.diferencaMediaPercent > 15 ? "danger" : "warning"}>±{item.diferencaMediaPercent}%</Badge>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Responsáveis">
          {data.responsaveis.length === 0 ? (
            <p className="text-sm text-nord-gray py-4 text-center">Sem dados suficientes ainda.</p>
          ) : (
            <div className="space-y-2">
              {data.responsaveis.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-white">{r.name}</span>
                  <span className="text-nord-gray">
                    {r.concluidas} produções · <span className="text-emerald-400">{r.precisaoMedia}% precisão</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
