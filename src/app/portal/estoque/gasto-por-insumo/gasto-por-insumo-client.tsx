"use client";

import { useEffect, useMemo, useState } from "react";
import { Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { PeriodFilterBar } from "@/components/ui/period-filter";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/calc";
import { type RollingPeriodKey } from "@/lib/periods";

type Row = {
  ingredientId: string;
  ingredientName: string;
  unidade: string;
  quantidadeRecebida: number;
  valorGasto: number;
  precoMedioPonderado: number;
};

export function GastoPorInsumoClient({ rows: initialRows }: { rows: Row[] }) {
  const [rows, setRows] = useState(initialRows);
  const [periodo, setPeriodo] = useState<RollingPeriodKey>("mes-atual");
  const [loading, setLoading] = useState(false);

  // Mesma sincronização de itens-vendidos-client: o período selecionado aqui não muda quando o
  // pai recarrega (ex.: navegação de volta), então reflete o dado recém-chegado do servidor.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com o dado inicial vindo do servidor
    setRows(initialRows);
  }, [initialRows]);

  async function applyPeriodo(key: RollingPeriodKey, from?: string, to?: string) {
    setPeriodo(key);
    setLoading(true);
    try {
      const params = new URLSearchParams({ periodo: key });
      if (key === "personalizado" && from && to) {
        params.set("from", from);
        params.set("to", to);
      }
      const res = await fetch(`/api/estoque/gasto-por-insumo?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setRows(data.rows);
    } finally {
      setLoading(false);
    }
  }

  const totalGasto = useMemo(() => rows.reduce((sum, r) => sum + r.valorGasto, 0), [rows]);
  // Já vem ordenado por valorGasto desc de computeGastoPorInsumoRows.
  const insumoMaiorGasto = rows[0] ?? null;

  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="estoque-gasto-por-insumo-kpi-order"
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        cards={[
          { key: "total-gasto", label: "Total gasto no período", value: formatCurrency(totalGasto), icon: "DollarSign" },
          { key: "insumos-com-gasto", label: "Insumos com gasto no período", value: String(rows.length), icon: "Boxes", color: "#2952E3" },
          {
            key: "insumo-maior-gasto",
            label: "Insumo que mais pesou no bolso",
            value: insumoMaiorGasto ? insumoMaiorGasto.ingredientName : "—",
            hint: insumoMaiorGasto ? formatCurrency(insumoMaiorGasto.valorGasto) : undefined,
            icon: "TrendingUp",
            color: "#F59E0B",
          },
        ]}
      />

      <Section title="Gasto por insumo no período">
        <div className="mb-4">
          <PeriodFilterBar periodo={periodo} onApply={applyPeriodo} loading={loading} />
        </div>

        <p className="text-xs text-nord-gray bg-nord-panel border border-nord-border rounded-lg px-3 py-2 mb-4">
          Considera apenas compras já confirmadas como recebidas, sem divergência registrada (mesmo
          depois de resolvida na Central de Divergências, a compra não volta a entrar neste
          relatório), pela quantidade que realmente chegou e pela data do recebimento — não da data
          do pedido.
        </p>

        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Insumo</th>
                <th className="py-2 pr-4">Quantidade recebida</th>
                <th className="py-2 pr-4">Preço médio</th>
                <th className="py-2 pr-4">Valor gasto</th>
                <th className="py-2 pr-4">Participação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ingredientId} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-white">{r.ingredientName}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {formatNumber(r.quantidadeRecebida, 1)} {r.unidade}
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {formatCurrency(r.precoMedioPonderado)} / {r.unidade}
                  </td>
                  <td className="py-2.5 pr-4 text-white font-medium">{formatCurrency(r.valorGasto)}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {totalGasto > 0 ? formatPercent((r.valorGasto / totalGasto) * 100) : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-nord-gray">
                    Nenhum insumo recebido no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
