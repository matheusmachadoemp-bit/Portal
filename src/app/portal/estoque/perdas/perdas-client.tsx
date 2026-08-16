"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import { LOSS_REASONS, LOSS_REASON_LABEL, SECTORS } from "@/lib/estoque";

type Loss = {
  id: string;
  data: string;
  setor: string | null;
  ingredientName: string;
  unidade: string;
  quantidade: number;
  valorEstimado: number;
  motivo: string;
  responsavel: string | null;
  observacao: string | null;
};

type IngredientOption = { id: string; name: string; unidade: string; setor: string | null; precoAtual: number; quantidadeEmbalagem: number; estoqueAtual: number };

const emptyForm = { ingredientId: "", quantidade: "", setor: "", motivo: "VENCIMENTO", responsavel: "", observacao: "" };

export function PerdasClient({ initialLosses, ingredients, canCreate }: { initialLosses: Loss[]; ingredients: IngredientOption[]; canCreate: boolean }) {
  const [losses, setLosses] = useState(initialLosses);
  const [motivoFilter, setMotivoFilter] = useState("");
  const [setorFilter, setSetorFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      losses.filter((l) => {
        if (motivoFilter && l.motivo !== motivoFilter) return false;
        if (setorFilter && l.setor !== setorFilter) return false;
        return true;
      }),
    [losses, motivoFilter, setorFilter]
  );

  const valorTotal = filtered.reduce((s, l) => s + l.valorEstimado, 0);

  const rankingProdutos = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of filtered) map.set(l.ingredientName, (map.get(l.ingredientName) ?? 0) + l.valorEstimado);
    return [...map.entries()].map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filtered]);

  const rankingMotivos = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of filtered) map.set(l.motivo, (map.get(l.motivo) ?? 0) + l.valorEstimado);
    return [...map.entries()].map(([motivo, value]) => ({ name: LOSS_REASON_LABEL[motivo] ?? motivo, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  async function refresh() {
    const res = await fetch("/api/estoque/perdas");
    const data = await res.json();
    setLosses(
      data.losses.map((l: Record<string, unknown>) => ({
        id: l.id,
        data: l.data,
        setor: l.setor,
        ingredientName: (l.ingredient as { name: string }).name,
        unidade: l.unidade,
        quantidade: l.quantidade,
        valorEstimado: l.valorEstimado,
        motivo: l.motivo,
        responsavel: l.responsavel,
        observacao: l.observacao,
      }))
    );
  }

  async function submit() {
    setError(null);
    const res = await fetch("/api/estoque/perdas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível registrar a perda.");
      return;
    }
    setShowForm(false);
    setForm(emptyForm);
    refresh();
  }

  const selectedIngredient = ingredients.find((i) => i.id === form.ingredientId);
  const valorEstimadoPreview =
    selectedIngredient && form.quantidade
      ? (selectedIngredient.precoAtual / (selectedIngredient.quantidadeEmbalagem || 1)) * Number(form.quantidade)
      : 0;

  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="estoque-perdas-kpi-order"
        className="grid grid-cols-2 md:grid-cols-3 gap-4"
        cards={[
          { key: "perdas-filtro", label: "Perdas no filtro", value: String(filtered.length), icon: "TriangleAlert", color: "#ef4444" },
          { key: "valor-total-estimado", label: "Valor total estimado", value: formatCurrency(valorTotal), icon: "DollarSign", color: "#ef4444" },
          { key: "motivo-mais-recorrente", label: "Motivo mais recorrente", value: rankingMotivos[0]?.name ?? "—", icon: "AlertOctagon" },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Produtos com maior perda">
          <ResponsiveContainer width="100%" height={Math.max(160, rankingProdutos.length * 32)}>
            <BarChart data={rankingProdutos} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--nord-border)" />
              <XAxis type="number" stroke="var(--nord-gray)" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="var(--nord-gray)" fontSize={11} width={140} />
              <Tooltip contentStyle={{ background: "var(--nord-card)", border: "1px solid var(--nord-border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
              <Bar dataKey="value" fill="#ef4444" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Motivos mais recorrentes">
          <ResponsiveContainer width="100%" height={Math.max(160, rankingMotivos.length * 32)}>
            <BarChart data={rankingMotivos} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--nord-border)" />
              <XAxis type="number" stroke="var(--nord-gray)" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="var(--nord-gray)" fontSize={11} width={140} />
              <Tooltip contentStyle={{ background: "var(--nord-card)", border: "1px solid var(--nord-border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
              <Bar dataKey="value" fill="#f59e0b" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <Section
        title="Registros de perdas e desperdícios"
        action={
          <Toolbar
            filters={
              <>
                <select className="input w-48" value={motivoFilter} onChange={(e) => setMotivoFilter(e.target.value)}>
                  <option value="">Todos os motivos</option>
                  {LOSS_REASONS.map((m) => (
                    <option key={m} value={m}>{LOSS_REASON_LABEL[m]}</option>
                  ))}
                </select>
                <select className="input w-48" value={setorFilter} onChange={(e) => setSetorFilter(e.target.value)}>
                  <option value="">Todos os setores</option>
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </>
            }
            exportFilename="perdas-desperdicios"
            exportSheetName="Perdas"
            exportRows={() =>
              filtered.map((l) => ({
                Data: format(new Date(l.data), "dd/MM/yyyy"),
                Produto: l.ingredientName,
                Setor: l.setor ?? "",
                Quantidade: `${l.quantidade} ${l.unidade}`,
                Motivo: LOSS_REASON_LABEL[l.motivo] ?? l.motivo,
                "Valor estimado": l.valorEstimado,
                Responsável: l.responsavel ?? "",
              }))
            }
            onRefresh={refresh}
            onAdd={canCreate ? () => { setForm(emptyForm); setError(null); setShowForm(true); } : undefined}
            addLabel="Registrar perda"
          />
        }
      >
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Produto</th>
                <th className="py-2 pr-4">Setor</th>
                <th className="py-2 pr-4">Quantidade</th>
                <th className="py-2 pr-4">Motivo</th>
                <th className="py-2 pr-4">Valor estimado</th>
                <th className="py-2 pr-4">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-nord-gray">{format(new Date(l.data), "dd/MM/yyyy")}</td>
                  <td className="py-2.5 pr-4 text-white">{l.ingredientName}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{l.setor ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{formatNumber(l.quantidade, 1)} {l.unidade}</td>
                  <td className="py-2.5 pr-4"><Badge tone="danger">{LOSS_REASON_LABEL[l.motivo] ?? l.motivo}</Badge></td>
                  <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(l.valorEstimado)}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{l.responsavel ?? "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-nord-gray">
                    Nenhuma perda registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Registrar perda" widthClass="max-w-md">
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Produto</span>
            <select
              className="input"
              value={form.ingredientId}
              onChange={(e) => {
                const sel = ingredients.find((i) => i.id === e.target.value);
                setForm({ ...form, ingredientId: e.target.value, setor: sel?.setor ?? form.setor });
              }}
            >
              <option value="">Selecione...</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>{i.name} (estoque: {formatNumber(i.estoqueAtual)} {i.unidade})</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Quantidade{selectedIngredient ? ` (${selectedIngredient.unidade})` : ""}</span>
            <input className="input" type="number" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Setor</span>
            <select className="input" value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })}>
              <option value="">Selecione...</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Motivo</span>
            <select className="input" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}>
              {LOSS_REASONS.map((m) => (
                <option key={m} value={m}>{LOSS_REASON_LABEL[m]}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Responsável</span>
            <input className="input" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Observação</span>
            <input className="input" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </label>
          {valorEstimadoPreview > 0 && <p className="text-xs text-nord-gray">Valor estimado: {formatCurrency(valorEstimadoPreview)}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={submit} disabled={!form.ingredientId || !form.quantidade} className="btn-primary w-full py-2.5">
            Registrar perda
          </button>
        </div>
      </Modal>
    </div>
  );
}
