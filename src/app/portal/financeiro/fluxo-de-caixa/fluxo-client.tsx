"use client";

import { useMemo, useState } from "react";
import { Section, StatCard } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/calc";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { COMPANY_LABEL } from "../finance-tabs";

type Entry = { valor: number; date: string; empresa: string; categoria: string };

export function FluxoCaixaClient({
  data,
}: {
  data: { payables: Entry[]; receivables: Entry[]; saldoInicial: number };
}) {
  const [granularidade, setGranularidade] = useState<"diario" | "semanal" | "mensal">("diario");
  const [empresa, setEmpresa] = useState("");

  const payables = useMemo(
    () => data.payables.filter((p) => !empresa || p.empresa === empresa),
    [data.payables, empresa]
  );
  const receivables = useMemo(
    () => data.receivables.filter((r) => !empresa || r.empresa === empresa),
    [data.receivables, empresa]
  );

  const entradas = receivables.reduce((a, r) => a + r.valor, 0);
  const saidas = payables.reduce((a, p) => a + p.valor, 0);
  const saldoFinal = data.saldoInicial + entradas - saidas;

  const chartData = useMemo(() => {
    function bucket(date: string) {
      const d = new Date(date);
      if (granularidade === "diario") return format(startOfDay(d), "dd/MM");
      if (granularidade === "semanal") return format(startOfWeek(d, { weekStartsOn: 1 }), "dd/MM");
      return format(startOfMonth(d), "MMM/yy", { locale: ptBR });
    }
    const map = new Map<string, { entradas: number; saidas: number }>();
    for (const r of receivables) {
      const key = bucket(r.date);
      const cur = map.get(key) ?? { entradas: 0, saidas: 0 };
      cur.entradas += r.valor;
      map.set(key, cur);
    }
    for (const p of payables) {
      const key = bucket(p.date);
      const cur = map.get(key) ?? { entradas: 0, saidas: 0 };
      cur.saidas += p.valor;
      map.set(key, cur);
    }
    const sorted = [...map.entries()].sort((a, b) => (a[0] > b[0] ? 1 : -1));
    const result: { date: string; entradas: number; saidas: number; saldo: number }[] = [];
    let saldo = data.saldoInicial;
    for (const [date, v] of sorted) {
      saldo += v.entradas - v.saidas;
      result.push({ date, ...v, saldo });
    }
    return result;
  }, [payables, receivables, granularidade, data.saldoInicial]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        {(["diario", "semanal", "mensal"] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGranularidade(g)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
              granularidade === g ? "bg-nord-blue text-white" : "border border-nord-border text-nord-gray"
            }`}
          >
            {g}
          </button>
        ))}
        <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="input-sm ml-auto">
          <option value="">Todas as empresas</option>
          <option value="NORD_PIZZA">{COMPANY_LABEL.NORD_PIZZA}</option>
          <option value="ZARKI_SUSHI">{COMPANY_LABEL.ZARKI_SUSHI}</option>
          <option value="GRUPO_NORD">{COMPANY_LABEL.GRUPO_NORD}</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Saldo Inicial" value={formatCurrency(data.saldoInicial)} icon="Wallet" />
        <StatCard label="Entradas" value={formatCurrency(entradas)} icon="ArrowDownCircle" color="#22c55e" />
        <StatCard label="Saídas" value={formatCurrency(saidas)} icon="ArrowUpCircle" color="#ef4444" />
        <StatCard label="Saldo Final" value={formatCurrency(saldoFinal)} icon="PiggyBank" />
      </div>

      <Section title={`Fluxo de caixa (${granularidade})`}>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
            <XAxis dataKey="date" stroke="#9a9aa2" fontSize={11} />
            <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip
              contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
              formatter={(v) => formatCurrency(Number(v))}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="entradas" name="Entradas" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="saidas" name="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="saldo" name="Saldo acumulado" stroke="#2952E3" strokeWidth={2} dot={false} />
          </ComposedChart>
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
