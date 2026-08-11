"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatCurrency, formatNumber } from "@/lib/calc";

type IngredientDTO = {
  id: string;
  name: string;
  fornecedor: string | null;
  unidade: string;
  precoAtual: number;
  quantidadeEmbalagem: number;
  percentualPerda: number;
  estoqueMinimo: number;
  estoqueAtual: number;
  validade: string | null;
  lastPurchaseDate: string | null;
  priceHistory: { id: string; price: number; createdAt: string }[];
};

const emptyForm = {
  name: "",
  fornecedor: "",
  unidade: "kg",
  precoAtual: "",
  quantidadeEmbalagem: "1",
  percentualPerda: "0",
  estoqueMinimo: "",
  estoqueAtual: "",
  validade: "",
};

export function InsumosClient({
  initialIngredients,
  canCreate = true,
}: {
  initialIngredients: IngredientDTO[];
  canCreate?: boolean;
}) {
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<IngredientDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [priceAlert, setPriceAlert] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/ficha-tecnica/insumos");
    const data = await res.json();
    setIngredients(data.ingredients);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(i: IngredientDTO) {
    setEditing(i);
    setForm({
      name: i.name,
      fornecedor: i.fornecedor ?? "",
      unidade: i.unidade,
      precoAtual: String(i.precoAtual),
      quantidadeEmbalagem: String(i.quantidadeEmbalagem),
      percentualPerda: String(i.percentualPerda),
      estoqueMinimo: String(i.estoqueMinimo),
      estoqueAtual: String(i.estoqueAtual),
      validade: i.validade ? i.validade.slice(0, 10) : "",
    });
    setShowForm(true);
  }

  async function submit() {
    if (editing) {
      const res = await fetch(`/api/ficha-tecnica/insumos/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.affectedProducts?.length) {
        setPriceAlert(
          `O preço de "${form.name}" foi atualizado. ${data.affectedProducts.length} ficha(s) técnica(s) tiveram o custo recalculado automaticamente: ${data.affectedProducts
            .map((p: { name: string }) => p.name)
            .join(", ")}.`
        );
      }
    } else {
      await fetch("/api/ficha-tecnica/insumos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setShowForm(false);
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/ficha-tecnica/insumos/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <Section
      title="Insumos cadastrados"
      action={
        canCreate ? (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Novo insumo
          </button>
        ) : undefined
      }
    >
      {!canCreate && (
        <p className="mb-4 text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
          cadastrar ou editar insumos.
        </p>
      )}
      {priceAlert && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-nord-blue/10 border border-nord-blue/30">
          <AlertTriangle size={14} className="text-nord-blue-light mt-0.5 shrink-0" />
          <p className="text-xs text-nord-blue-light">{priceAlert}</p>
        </div>
      )}

      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Insumo</th>
              <th className="py-2 pr-4">Fornecedor</th>
              <th className="py-2 pr-4">Preço atual</th>
              <th className="py-2 pr-4">Embalagem</th>
              <th className="py-2 pr-4">Estoque</th>
              <th className="py-2 pr-4">Alerta</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((i) => {
              const baixo = i.estoqueAtual <= i.estoqueMinimo;
              return (
                <tr key={i.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-white">{i.name}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{i.fornecedor}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(i.precoAtual)}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {formatNumber(i.quantidadeEmbalagem)} {i.unidade}
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {formatNumber(i.estoqueAtual)} {i.unidade}
                  </td>
                  <td className="py-2.5 pr-4">
                    {baixo && <Badge tone="danger">Repor estoque</Badge>}
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className={`flex items-center gap-2 justify-end ${!canCreate ? "hidden" : ""}`}>
                      <button onClick={() => openEdit(i)} className="text-nord-gray hover:text-white">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDeleteId(i.id)} className="text-nord-gray hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar insumo" : "Novo insumo"}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Nome do insumo">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Fornecedor">
            <input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} className="input" />
          </Field>
          <Field label="Unidade de medida">
            <input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} className="input" placeholder="kg, g, L, un" />
          </Field>
          <Field label="Preço atual (R$)">
            <input type="number" value={form.precoAtual} onChange={(e) => setForm({ ...form, precoAtual: e.target.value })} className="input" />
          </Field>
          <Field label="Qtd. da embalagem">
            <input type="number" value={form.quantidadeEmbalagem} onChange={(e) => setForm({ ...form, quantidadeEmbalagem: e.target.value })} className="input" />
          </Field>
          <Field label="% de perda">
            <input type="number" value={form.percentualPerda} onChange={(e) => setForm({ ...form, percentualPerda: e.target.value })} className="input" />
          </Field>
          <Field label="Estoque mínimo">
            <input type="number" value={form.estoqueMinimo} onChange={(e) => setForm({ ...form, estoqueMinimo: e.target.value })} className="input" />
          </Field>
          <Field label="Estoque atual">
            <input type="number" value={form.estoqueAtual} onChange={(e) => setForm({ ...form, estoqueAtual: e.target.value })} className="input" />
          </Field>
          <Field label="Validade">
            <input type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} className="input" />
          </Field>
        </div>
        <button onClick={submit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir insumo"
        message="Tem certeza que deseja excluir este insumo? Ele será removido de todas as fichas técnicas."
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />

      <style jsx global>{`
        .input {
          width: 100%;
          background: var(--nord-panel);
          border: 1px solid var(--nord-border);
          border-radius: 8px;
          padding: 8px 12px;
          color: white;
          font-size: 13px;
          outline: none;
        }
        .input:focus {
          border-color: var(--nord-blue);
        }
      `}</style>
    </Section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-nord-gray mb-1">{label}</span>
      {children}
    </label>
  );
}
