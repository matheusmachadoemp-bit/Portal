"use client";

import { Fragment, useEffect, useState } from "react";
import { Section } from "@/components/ui/stat-card";
import { formatCurrency, formatPercent } from "@/lib/calc";
import { Download } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { COMPANY_LABEL } from "../finance-tabs";

type DreRow = {
  key: string;
  label: string;
  type: "group" | "result";
  value: number;
  percent: number;
  highlight?: boolean;
  categories?: { key: string; name: string; value: number }[];
};

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function DreClient({
  initialRows,
  initialMonth,
  initialYear,
  monthlyEvolution,
}: {
  initialRows: DreRow[];
  initialMonth: number;
  initialYear: number;
  monthlyEvolution: { month: string; faturamento: number; lucroLiquido: number }[];
}) {
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [empresa, setEmpresa] = useState("ALL");
  const [rows, setRows] = useState(initialRows);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/financeiro/dre?month=${month}&year=${year}&empresa=${empresa}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setRows(data.rows);
      });
    return () => {
      cancelled = true;
    };
  }, [month, year, empresa]);

  function exportCsv() {
    const header = ["Linha", "Valor", "%"];
    const csvRows = rows.map((r) => [r.label, r.value.toFixed(2), r.percent.toFixed(2)]);
    const csv = [header, ...csvRows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dre-${month}-${year}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input-sm">
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-sm">
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="input-sm">
          <option value="ALL">{COMPANY_LABEL.ALL}</option>
          <option value="NORD_PIZZA">{COMPANY_LABEL.NORD_PIZZA}</option>
          <option value="ZARKI_SUSHI">{COMPANY_LABEL.ZARKI_SUSHI}</option>
        </select>
        <button
          onClick={exportCsv}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white"
        >
          <Download size={13} /> Exportar DRE
        </button>
      </div>

      <Section title={`DRE — ${MONTHS[month - 1]}/${year}`}>
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Plano de Contas</th>
                <th className="py-2 pr-4 text-right">Valor</th>
                <th className="py-2 pr-4 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.key}>
                  <tr
                    className={`border-b border-nord-border/50 ${
                      r.type === "result" ? "bg-white/5" : "hover:bg-white/5 cursor-pointer"
                    }`}
                    onClick={() =>
                      r.categories && setExpanded((e) => ({ ...e, [r.key]: !e[r.key] }))
                    }
                  >
                    <td
                      className={`py-2 pr-4 ${
                        r.type === "result"
                          ? r.highlight
                            ? "text-white font-semibold"
                            : "text-nord-gray font-medium"
                          : "text-white font-medium"
                      }`}
                    >
                      {r.label}
                    </td>
                    <td
                      className={`py-2 pr-4 text-right ${
                        r.value < 0 ? "text-red-400" : r.type === "result" && r.highlight ? "text-emerald-400" : "text-nord-gray"
                      }`}
                    >
                      {formatCurrency(r.value)}
                    </td>
                    <td className="py-2 pr-4 text-right text-nord-gray">{formatPercent(r.percent)}</td>
                  </tr>
                  {expanded[r.key] &&
                    r.categories?.map((c) => (
                      <tr key={c.key} className="border-b border-nord-border/30 bg-black/20">
                        <td className="py-1.5 pr-4 pl-8 text-xs text-nord-gray">{c.name}</td>
                        <td className="py-1.5 pr-4 text-right text-xs text-nord-gray">{formatCurrency(c.value)}</td>
                        <td className="py-1.5 pr-4"></td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-nord-gray mt-3">
          Clique numa linha de grupo para ver o detalhamento por categoria. Estrutura fixa, valores calculados
          automaticamente a partir dos lançamentos de Contas a Pagar e Contas a Receber.
        </p>
      </Section>

      <Section title="Evolução mensal — Faturamento x Lucro Líquido">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={monthlyEvolution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
            <XAxis dataKey="month" stroke="#9a9aa2" fontSize={11} />
            <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip
              contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
              formatter={(v) => formatCurrency(Number(v))}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="faturamento" name="Faturamento" stroke="#2952E3" strokeWidth={2} />
            <Line type="monotone" dataKey="lucroLiquido" name="Lucro Líquido" stroke="#22c55e" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      <style jsx global>{`
        .input-sm {
          background: var(--nord-panel);
          border: 1px solid var(--nord-border);
          border-radius: 8px;
          padding: 6px 8px;
          color: white;
          font-size: 12px;
          outline: none;
        }
      `}</style>
    </div>
  );
}
