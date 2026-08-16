"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";

type CategoryDTO = {
  id: string;
  name: string;
  type: string;
  dreKey: string;
  active: boolean;
};

type DreOption = { key: string; name: string; groupKey: string; sign: 1 | -1 };

const TYPE_LABEL: Record<string, string> = {
  RECEITA: "Receita",
  DESPESA: "Despesa",
  CUSTO: "Custo",
  INVESTIMENTO: "Investimento",
};

const TYPE_TONE: Record<string, "success" | "danger" | "warning" | "info"> = {
  RECEITA: "success",
  DESPESA: "danger",
  CUSTO: "warning",
  INVESTIMENTO: "info",
};

const emptyForm = { name: "", type: "DESPESA", dreKey: "" };

export function CategoriasClient({
  initialCategories,
  dreOptions,
}: {
  initialCategories: CategoryDTO[];
  dreOptions: DreOption[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CategoryDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [categories, search]
  );

  const dreNameByKey = useMemo(() => new Map(dreOptions.map((o) => [o.key, o.name])), [dreOptions]);

  async function refresh() {
    const res = await fetch("/api/financeiro/categorias");
    const data = await res.json();
    setCategories(data.categories);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, dreKey: dreOptions[0]?.key ?? "" });
    setShowForm(true);
  }

  function openEdit(c: CategoryDTO) {
    setEditing(c);
    setForm({ name: c.name, type: c.type, dreKey: c.dreKey });
    setShowForm(true);
  }

  async function submit() {
    if (!form.name.trim() || !form.dreKey) {
      setFormError("Nome e linha da DRE são obrigatórios.");
      return;
    }
    setFormError(null);
    setSaving(true);
    const result = editing
      ? await apiRequest(`/api/financeiro/categorias/${editing.id}`, "PATCH", form)
      : await apiRequest("/api/financeiro/categorias", "POST", form);
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setShowForm(false);
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    const result = await apiRequest(`/api/financeiro/categorias/${confirmDeleteId}`, "DELETE");
    if (!result.ok) {
      setRowError(result.error);
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(null);
    refresh();
  }

  async function toggleActive(c: CategoryDTO) {
    await apiRequest(`/api/financeiro/categorias/${c.id}`, "PATCH", { active: !c.active });
    refresh();
  }

  return (
    <Section
      title="Categorias Financeiras"
      action={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="bg-nord-panel border border-nord-border rounded-lg pl-7 pr-2 py-1.5 text-xs text-white w-48"
            />
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Nova categoria
          </button>
        </div>
      }
    >
      <FormError message={rowError} />
      <p className="text-xs text-nord-gray mb-3">
        Toda categoria financeira possui vínculo obrigatório com uma linha da DRE — o lançamento associado a ela
        alimenta automaticamente aquela linha.
      </p>
      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Nome</th>
              <th className="py-2 pr-4">Tipo</th>
              <th className="py-2 pr-4">Linha da DRE</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className={`py-2 pr-4 ${c.active ? "text-white" : "text-nord-gray"}`}>{c.name}</td>
                <td className="py-2 pr-4">
                  <Badge tone={TYPE_TONE[c.type]}>{TYPE_LABEL[c.type]}</Badge>
                </td>
                <td className="py-2 pr-4 text-nord-gray">{dreNameByKey.get(c.dreKey) ?? c.dreKey}</td>
                <td className="py-2 pr-4">
                  <button onClick={() => toggleActive(c)}>
                    <Badge tone={c.active ? "success" : "default"}>{c.active ? "Ativo" : "Inativo"}</Badge>
                  </button>
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(c)} className="text-nord-gray hover:text-white">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDeleteId(c.id)} className="text-nord-gray hover:text-nord-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar categoria" : "Nova categoria financeira"}>
        <FormError message={formError} />
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Tipo</span>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Linha da DRE (obrigatório)</span>
            <select value={form.dreKey} onChange={(e) => setForm({ ...form, dreKey: e.target.value })} className="input">
              {dreOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setShowForm(false)}
            className="flex-1 border border-nord-border text-nord-gray hover:text-white hover:border-white/30 text-sm font-medium rounded-lg py-2.5"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir categoria"
        message="Tem certeza? Lançamentos que usam essa categoria podem ficar inconsistentes."
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
