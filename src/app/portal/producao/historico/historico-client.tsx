"use client";

import { useMemo, useState } from "react";
import { Toolbar } from "@/components/ui/toolbar";
import { compareProducedToPlanned, PRODUCTION_STATUS_LABEL } from "@/lib/producao";
import { STANDARD_PERIOD_OPTIONS, resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";
import type { ProductionOrderDTO } from "../types";

export function HistoricoClient({ initialOrdens }: { initialOrdens: ProductionOrderDTO[] }) {
  const [ordens] = useState(initialOrdens);
  const [periodo, setPeriodo] = useState<RollingPeriodKey>("mes-atual");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const range = useMemo(() => {
    if (periodo === "personalizado" && (!from || !to)) return null;
    return resolveRollingPeriod(periodo, { from, to });
  }, [periodo, from, to]);

  const filtered = useMemo(() => {
    return ordens.filter((o) => {
      if (!range) return true;
      const date = new Date(o.date);
      return date >= range.from && date <= range.to;
    });
  }, [ordens, range]);

  return (
    <div className="space-y-4">
      <Toolbar
        filters={
          <>
            <select className="input w-40" value={periodo} onChange={(e) => setPeriodo(e.target.value as RollingPeriodKey)}>
              {STANDARD_PERIOD_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            {periodo === "personalizado" && (
              <>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input w-auto" />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input w-auto" />
              </>
            )}
          </>
        }
        exportFilename="historico-producao"
        exportSheetName="Histórico"
        exportRows={() =>
          filtered.map((o) => {
            const planejado = o.quantidadeAprovada ?? o.quantidadeSugerida;
            const produzido = o.quantidadeProduzida ?? 0;
            return {
              Data: new Date(o.date).toLocaleDateString("pt-BR"),
              Produto: o.productionItem.name,
              Categoria: o.productionItem.category.name,
              Planejado: planejado,
              Produzido: produzido,
              Diferença: produzido - planejado,
              Responsável: o.responsavel?.name ?? "",
              Status: PRODUCTION_STATUS_LABEL[o.status] ?? o.status,
            };
          })
        }
      />

      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 px-3">Data</th>
              <th className="py-2 px-3">Produto</th>
              <th className="py-2 px-3">Planejado</th>
              <th className="py-2 px-3">Produzido</th>
              <th className="py-2 px-3">Diferença</th>
              <th className="py-2 px-3">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const planejado = o.quantidadeAprovada ?? o.quantidadeSugerida;
              const produzido = o.quantidadeProduzida ?? 0;
              const { diferenca, alerta } = compareProducedToPlanned(planejado, produzido, 10);
              return (
                <tr key={o.id} className="border-b border-nord-border/50">
                  <td className="py-2 px-3 text-nord-gray">{new Date(o.date).toLocaleDateString("pt-BR")}</td>
                  <td className="py-2 px-3 text-white">{o.productionItem.name}</td>
                  <td className="py-2 px-3 text-nord-gray">
                    {planejado} {o.productionItem.unidade}
                  </td>
                  <td className="py-2 px-3 text-white">
                    {produzido} {o.productionItem.unidade}
                  </td>
                  <td className={`py-2 px-3 font-medium ${alerta === "abaixo" ? "text-amber-400" : alerta === "acima" ? "text-blue-400" : "text-nord-gray"}`}>
                    {diferenca > 0 ? "+" : ""}
                    {diferenca.toFixed(1)} {o.productionItem.unidade}
                  </td>
                  <td className="py-2 px-3 text-nord-gray">{o.responsavel?.name ?? "—"}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-nord-gray text-sm">
                  Nenhuma produção concluída no período selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
