"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, AlertTriangle, Tag, Settings2 } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { formatCurrency, formatNumber } from "@/lib/calc";

type CategoryDTO = { id: string; name: string; color: string; icon: string };

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
  categoryId: string | null;
  category: CategoryDTO | null;
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
  categoryId: "",
};

const SEM_CATEGORIA = "__sem-categoria__";

export function InsumosClient({
  initialIngredients,
  categories,
  canCreate = true,
}: {
  initialIngredients: IngredientDTO[];
  categories: CategoryDTO[];
  canCreate?: boolean;
}) {
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<IngredientDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [priceAlert, setPriceAlert] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");

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
      categoryId: i.categoryId ?? "",
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

  const groups = useMemo(() => {
    const byCategory = new Map<string, { category: CategoryDTO | null; items: IngredientDTO[] }>();
    for (const i of ingredients) {
      const key = i.category?.id ?? SEM_CATEGORIA;
      if (!byCategory.has(key)) byCategory.set(key, { category: i.category, items: [] });
      byCategory.get(key)!.items.push(i);
    }
    const ordered = categories
      .map((c) => byCategory.get(c.id))
      .filter((g): g is { category: CategoryDTO | null; items: IngredientDTO[] } => !!g);
    const semCategoria = byCategory.get(SEM_CATEGORIA);
    if (semCategoria) ordered.push({ category: null, items: semCategoria.items });
    return ordered;
  }, [ingredients, categories]);

  const visibleGroups = categoryFilter
    ? groups.filter((g) => (g.category?.id ?? SEM_CATEGORIA) === categoryFilter)
    : groups;

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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setCategoryFilter("")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
            categoryFilter === "" ? "bg-nord-blue border-nord-blue text-white" : "border-nord-border text-nord-gray hover:text-white"
          }`}
        >
          Todas ({ingredients.length})
        </button>
        {categories.map((c) => {
          const count = ingredients.filter((i) => i.categoryId === c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                categoryFilter === c.id ? "text-white" : "border-nord-border text-nord-gray hover:text-white"
              }`}
              style={categoryFilter === c.id ? { backgroundColor: c.color, borderColor: c.color } : undefined}
            >
              <DynamicIcon name={c.icon} size={13} />
              {c.name} ({count})
            </button>
          );
        })}
        {ingredients.some((i) => !i.categoryId) && (
          <button
            onClick={() => setCategoryFilter(SEM_CATEGORIA)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
              categoryFilter === SEM_CATEGORIA ? "bg-nord-gray border-nord-gray text-white" : "border-nord-border text-nord-gray hover:text-white"
            }`}
          >
            <Tag size={13} /> Sem categoria ({ingredients.filter((i) => !i.categoryId).length})
          </button>
        )}
        <Link
          href="/portal/estoque/categorias"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-nord-border text-nord-gray hover:text-white hover:border-white/30 ml-auto"
        >
          <Settings2 size={13} /> Gerenciar categorias
        </Link>
      </div>

      <div className="space-y-6">
        {visibleGroups.map((g) => (
          <div key={g.category?.id ?? SEM_CATEGORIA}>
            <div className="flex items-center gap-2 mb-2">
              {g.category ? (
                <>
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${g.category.color}22` }}
                  >
                    <DynamicIcon name={g.category.icon} size={13} style={{ color: g.category.color }} />
                  </div>
                  <h3 className="text-sm font-medium text-white">{g.category.name}</h3>
                </>
              ) : (
                <>
                  <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-white/5">
                    <Tag size={13} className="text-nord-gray" />
                  </div>
                  <h3 className="text-sm font-medium text-nord-gray">Sem categoria</h3>
                </>
              )}
              <span className="text-xs text-nord-gray">({g.items.length})</span>
            </div>
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
                  {g.items.map((i) => {
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
                        <td className="py-2.5 pr-4">{baixo && <Badge tone="danger">Repor estoque</Badge>}</td>
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
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar insumo" : "Novo insumo"}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Nome do insumo">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Categoria">
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="input">
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
