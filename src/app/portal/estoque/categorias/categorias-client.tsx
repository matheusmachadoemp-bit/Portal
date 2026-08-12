"use client";

import { useState } from "react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { IconPicker, ColorPicker } from "@/components/ui/icon-picker";
import { DynamicIcon } from "@/components/dynamic-icon";
import { SECTORS } from "@/lib/estoque";

type Category = {
  id: string;
  name: string;
  color: string;
  icon: string;
  setor: string | null;
  metaPerdaPercent: number;
  periodicidadeContagem: string;
  active: boolean;
  produtos: number;
};

const emptyForm = { id: "", name: "", color: "#2952E3", icon: "Boxes", setor: "", metaPerdaPercent: "2", periodicidadeContagem: "SEMANAL" };

export function CategoriasClient({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/estoque/categorias");
    const data = await res.json();
    setCategories(
      data.categories.map((c: Record<string, unknown>) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        icon: c.icon,
        setor: c.setor,
        metaPerdaPercent: c.metaPerdaPercent,
        periodicidadeContagem: c.periodicidadeContagem,
        active: c.active,
        produtos: (c._count as { ingredients: number }).ingredients,
      }))
    );
  }

  function openEdit(c: Category) {
    setForm({
      id: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      setor: c.setor ?? "",
      metaPerdaPercent: String(c.metaPerdaPercent),
      periodicidadeContagem: c.periodicidadeContagem,
    });
    setError(null);
    setShowForm(true);
  }

  async function submit() {
    setError(null);
    const isEdit = !!form.id;
    const res = await fetch(isEdit ? `/api/estoque/categorias/${form.id}` : "/api/estoque/categorias", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Não foi possível salvar a categoria.");
      return;
    }
    setShowForm(false);
    setForm(emptyForm);
    refresh();
  }

  async function toggleActive(c: Category) {
    await fetch(`/api/estoque/categorias/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    refresh();
  }

  return (
    <Section
      title="Categorias de produto"
      action={
        <Toolbar
          onRefresh={refresh}
          onAdd={() => { setForm(emptyForm); setError(null); setShowForm(true); }}
          addLabel="Nova categoria"
        />
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => openEdit(c)}
            className={`nord-card p-4 text-left space-y-2 hover:border-nord-blue transition ${!c.active ? "opacity-50" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.color}22` }}>
                  <DynamicIcon name={c.icon} size={16} style={{ color: c.color }} />
                </div>
                <span className="text-white font-medium text-sm">{c.name}</span>
              </div>
              <Badge tone={c.active ? "success" : "default"}>{c.active ? "Ativa" : "Inativa"}</Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-nord-gray">
              <span>{c.setor ?? "Sem setor padrão"}</span>
              <span>{c.produtos} produto(s)</span>
            </div>
            <div className="flex items-center justify-between text-xs text-nord-gray">
              <span>Meta de perda: {c.metaPerdaPercent}%</span>
              <span>{c.periodicidadeContagem === "MENSAL" ? "Contagem mensal" : "Contagem semanal"}</span>
            </div>
            <div className="pt-1 flex justify-end">
              <span
                onClick={(e) => { e.stopPropagation(); toggleActive(c); }}
                className="text-[11px] text-nord-blue-light hover:underline"
              >
                {c.active ? "Desativar" : "Ativar"}
              </span>
            </div>
          </button>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? "Editar categoria" : "Nova categoria"}>
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1.5">Nome</span>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1.5">Ícone</span>
            <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1.5">Cor</span>
            <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1.5">Setor responsável</span>
            <select className="input" value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })}>
              <option value="">Selecione...</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1.5">Meta máxima de perda (%)</span>
            <input className="input" type="number" value={form.metaPerdaPercent} onChange={(e) => setForm({ ...form, metaPerdaPercent: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1.5">Periodicidade da contagem</span>
            <select className="input" value={form.periodicidadeContagem} onChange={(e) => setForm({ ...form, periodicidadeContagem: e.target.value })}>
              <option value="SEMANAL">Semanal</option>
              <option value="MENSAL">Mensal</option>
            </select>
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={submit} disabled={!form.name.trim()} className="btn-primary w-full py-2.5">
            Salvar
          </button>
        </div>
      </Modal>
    </Section>
  );
}
