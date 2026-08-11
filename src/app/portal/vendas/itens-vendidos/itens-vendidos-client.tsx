"use client";

import { useMemo, useState } from "react";
import { Section, Badge } from "@/components/ui/stat-card";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { buildCurvaAbc, type AbcClass } from "@/lib/vendas-analytics";

type Row = { nome: string; quantidade: number; faturamento: number; margem: number };
type Criterio = "quantidade" | "faturamento" | "margem";

const CRITERIO_LABEL: Record<Criterio, string> = { quantidade: "Quantidade", faturamento: "Faturamento", margem: "Margem" };
const CLASS_TONE: Record<AbcClass, "success" | "info" | "default"> = { A: "success", B: "info", C: "default" };

export function ItensVendidosClient({ rows }: { rows: Row[] }) {
  const [criterio, setCriterio] = useState<Criterio>("faturamento");

  const curva = useMemo(() => buildCurvaAbc(rows.map((r) => ({ ...r, value: r[criterio] }))), [rows, criterio]);

  const counts = { A: curva.filter((r) => r.classe === "A").length, B: curva.filter((r) => r.classe === "B").length, C: curva.filter((r) => r.classe === "C").length };

  return (
    <Section
      title="Curva ABC (últimos 30 dias)"
      action={
        <div className="flex gap-1.5">
          {(Object.keys(CRITERIO_LABEL) as Criterio[]).map((c) => (
            <button
              key={c}
              onClick={() => setCriterio(c)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${criterio === c ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"}`}
            >
              {CRITERIO_LABEL[c]}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex items-center gap-3 mb-4 text-xs text-nord-gray">
        <span className="flex items-center gap-1"><Badge tone="success">A</Badge> {counts.A} produtos</span>
        <span className="flex items-center gap-1"><Badge tone="info">B</Badge> {counts.B} produtos</span>
        <span className="flex items-center gap-1"><Badge tone="default">C</Badge> {counts.C} produtos</span>
      </div>
      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Produto</th>
              <th className="py-2 pr-4">Quantidade</th>
              <th className="py-2 pr-4">Faturamento</th>
              <th className="py-2 pr-4">Margem</th>
              <th className="py-2 pr-4">Participação</th>
              <th className="py-2 pr-4">Acumulado</th>
              <th className="py-2 pr-4">Classe</th>
            </tr>
          </thead>
          <tbody>
            {curva.map((r) => (
              <tr key={r.nome} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 pr-4 text-white">{r.nome}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{formatNumber(r.quantidade)}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(r.faturamento)}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(r.margem)}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{r.participacaoPercent.toFixed(1)}%</td>
                <td className="py-2.5 pr-4 text-nord-gray">{r.participacaoAcumuladaPercent.toFixed(1)}%</td>
                <td className="py-2.5 pr-4">
                  <Badge tone={CLASS_TONE[r.classe]}>{r.classe}</Badge>
                </td>
              </tr>
            ))}
            {curva.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-nord-gray">
                  Nenhum item vendido lançado nos últimos 30 dias. Lance vendas em Vendas → Lançamentos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
