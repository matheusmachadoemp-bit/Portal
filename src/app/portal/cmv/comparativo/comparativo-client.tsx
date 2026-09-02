"use client";

import { useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency, formatPercent } from "@/lib/calc";
import { format } from "date-fns";
import { ACTION_PLAN_STATUS_LABEL, ACTION_PLAN_STATUS_TONE, classificarCmv, COMPARATIVO_CAUSAS } from "@/lib/estoque";

type Plan = {
  id: string;
  problema: string;
  causaProvavel: string | null;
  acaoCorretiva: string;
  responsavel: string | null;
  prazo: string | null;
  status: string;
  createdByName: string;
};

const emptyForm = { problema: "", causaProvavel: "", acaoCorretiva: "", responsavel: "", prazo: "" };

export function ComparativoClient({
  cmvRealPercent,
  cmvTeoricoPercent,
  custoConsumido,
  cmvTeoricoValor,
  metaCmvPercent,
  semanal,
  perdasPorSetorChart,
  plans: initialPlans,
  canCreate,
}: {
  cmvRealPercent: number;
  cmvTeoricoPercent: number;
  custoConsumido: number;
  cmvTeoricoValor: number;
  metaCmvPercent: number;
  semanal: { periodo: string; real: number; teorico: number }[];
  perdasPorSetorChart: { name: string; value: number }[];
  plans: Plan[];
  canCreate: boolean;
}) {
  const [plans, setPlans] = useState(initialPlans);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const diferencaPP = cmvRealPercent - cmvTeoricoPercent;
  const diferencaValor = custoConsumido - cmvTeoricoValor;
  const classificacao = classificarCmv(cmvRealPercent, metaCmvPercent, cmvRealPercent > 0 || cmvTeoricoPercent > 0);

  async function refreshPlans() {
    const res = await fetch("/api/estoque/planos-acao");
    const data = await res.json();
    setPlans(data.plans.map((p: Record<string, unknown>) => ({ ...p, createdByName: (p.createdBy as { name: string }).name })));
  }

  function abrirPlanoComCausa(causa: string) {
    setForm({ ...emptyForm, problema: `CMV Real acima do Teórico em ${diferencaPP.toFixed(1)} p.p.`, causaProvavel: causa });
    setError(null);
    setShowForm(true);
  }

  async function submit() {
    setError(null);
    if (!form.problema || !form.acaoCorretiva) {
      setError("Descreva o problema e a ação corretiva.");
      return;
    }
    const res = await fetch("/api/estoque/planos-acao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível criar o plano de ação.");
      return;
    }
    setShowForm(false);
    setForm(emptyForm);
    refreshPlans();
  }

  async function updateStatus(plan: Plan, status: string) {
    await fetch(`/api/estoque/planos-acao/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    refreshPlans();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 md:col-span-3">
          <SortableStatCards
            storageKey="estoque-comparativo-kpi-order"
            className="grid grid-cols-2 md:grid-cols-3 gap-4"
            cards={[
              { key: "cmv-real", label: "CMV Real", value: formatPercent(cmvRealPercent), icon: "Warehouse", hint: formatCurrency(custoConsumido) },
              { key: "cmv-teorico", label: "CMV Teórico", value: formatPercent(cmvTeoricoPercent), icon: "Calculator", hint: formatCurrency(cmvTeoricoValor) },
              {
                key: "diferenca",
                label: "Diferença",
                value: `${diferencaPP >= 0 ? "+" : ""}${diferencaPP.toFixed(1)} p.p.`,
                icon: diferencaPP > 0 ? "TriangleAlert" : "CheckCircle2",
                color: diferencaPP > 0 ? "#ef4444" : "#22c55e",
                hint: formatCurrency(diferencaValor),
              },
            ]}
          />
        </div>
        <div className="nord-card p-4 flex flex-col justify-center items-start gap-2">
          <span className="text-xs text-nord-gray">Classificação do resultado</span>
          <Badge tone={classificacao.tone}>{classificacao.label}</Badge>
        </div>
      </div>

      <Section title="CMV Real x Teórico por semana">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={semanal}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--nord-border)" />
            <XAxis dataKey="periodo" stroke="var(--nord-gray)" fontSize={11} />
            <YAxis stroke="var(--nord-gray)" fontSize={11} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={{ background: "var(--nord-card)", border: "1px solid var(--nord-border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="teorico" name="CMV Teórico" stroke="#2952E3" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="real" name="CMV Real" stroke="#eab308" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      {perdasPorSetorChart.length > 0 && (
        <Section title="Perdas por setor no período (contribuinte para a diferença)">
          <ResponsiveContainer width="100%" height={Math.max(160, perdasPorSetorChart.length * 32)}>
            <BarChart data={perdasPorSetorChart} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--nord-border)" />
              <XAxis type="number" stroke="var(--nord-gray)" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="var(--nord-gray)" fontSize={11} width={140} />
              <Tooltip contentStyle={{ background: "var(--nord-card)", border: "1px solid var(--nord-border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
              <Bar dataKey="value" fill="#ef4444" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      <Section title="Possíveis causas da diferença">
        <div className="flex flex-wrap gap-2">
          {COMPARATIVO_CAUSAS.map((causa) => (
            <button
              key={causa}
              onClick={() => canCreate && abrirPlanoComCausa(causa)}
              className="px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white hover:border-nord-blue"
            >
              {causa}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Planos de ação"
        action={<Toolbar onRefresh={refreshPlans} onAdd={canCreate ? () => { setForm(emptyForm); setError(null); setShowForm(true); } : undefined} addLabel="Gerar plano de ação" />}
      >
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Problema</th>
                <th className="py-2 pr-4">Causa provável</th>
                <th className="py-2 pr-4">Ação corretiva</th>
                <th className="py-2 pr-4">Responsável</th>
                <th className="py-2 pr-4">Prazo</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-white max-w-xs">{p.problema}</td>
                  <td className="py-2.5 pr-4 text-nord-gray max-w-xs">{p.causaProvavel ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray max-w-xs">{p.acaoCorretiva}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{p.responsavel ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{p.prazo ? format(new Date(p.prazo), "dd/MM/yyyy") : "—"}</td>
                  <td className="py-2.5 pr-4">
                    {canCreate ? (
                      <select
                        value={p.status}
                        onChange={(e) => updateStatus(p, e.target.value)}
                        className="input w-auto py-1 text-xs"
                      >
                        {Object.entries(ACTION_PLAN_STATUS_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <Badge tone={ACTION_PLAN_STATUS_TONE[p.status]}>{ACTION_PLAN_STATUS_LABEL[p.status]}</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-nord-gray">
                    Nenhum plano de ação criado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Gerar plano de ação" widthClass="max-w-lg">
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Problema</span>
            <input className="input" value={form.problema} onChange={(e) => setForm({ ...form, problema: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Causa provável</span>
            <input className="input" value={form.causaProvavel} onChange={(e) => setForm({ ...form, causaProvavel: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Ação corretiva</span>
            <input className="input" value={form.acaoCorretiva} onChange={(e) => setForm({ ...form, acaoCorretiva: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Responsável</span>
            <input className="input" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Prazo</span>
            <input className="input" type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={submit} className="btn-primary w-full py-2.5">
            Salvar plano de ação
          </button>
        </div>
      </Modal>
    </div>
  );
}
