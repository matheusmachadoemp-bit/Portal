"use client";

import { useState } from "react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { Badge } from "@/components/ui/stat-card";
import { IDEA_STATUS_OPTIONS, CATEGORY_OPTIONS } from "@/lib/marketing";

type Idea = {
  id: string;
  title: string;
  description: string | null;
  references: string | null;
  links: string | null;
  category: string | null;
  tags: string | null;
  status: string;
  createdAt: string;
  createdBy: { name: string };
  empresa: { name: string };
};

const emptyForm = { title: "", description: "", references: "", links: "", category: "", tags: "" };

export function IdeasClient({ initialIdeas, canCreate }: { initialIdeas: Idea[]; canCreate: boolean }) {
  const [ideas, setIdeas] = useState(initialIdeas);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/marketing/ideas");
    const data = await res.json();
    setIdeas(data.ideas);
  }

  async function submit() {
    await fetch("/api/marketing/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm(emptyForm);
    refresh();
  }

  async function setStatus(idea: Idea, status: string) {
    await fetch(`/api/marketing/ideas/${idea.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    refresh();
  }

  async function promote(idea: Idea) {
    await fetch(`/api/marketing/ideas/${idea.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promote: true }),
    });
    setPromoted(idea.id);
    setTimeout(() => setPromoted(null), 2500);
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/marketing/ideas/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      {canCreate && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Nova ideia
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ideas.map((idea) => {
          const statusOpt = IDEA_STATUS_OPTIONS.find((s) => s.key === idea.status);
          return (
            <div key={idea.id} className="nord-card p-4">
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-white font-medium text-sm">{idea.title}</h4>
                <Badge tone={statusOpt?.tone ?? "default"}>{statusOpt?.label ?? idea.status}</Badge>
              </div>
              {idea.description && <p className="text-xs text-nord-gray mb-2 line-clamp-3">{idea.description}</p>}
              {idea.category && <Badge>{idea.category}</Badge>}
              {idea.links && (
                <p className="text-xs text-nord-blue-light mt-2 truncate">{idea.links}</p>
              )}
              <p className="text-[11px] text-nord-gray mt-3">{idea.createdBy.name} · {idea.empresa.name}</p>

              {canCreate && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-nord-border">
                  <select
                    value={idea.status}
                    onChange={(e) => setStatus(idea, e.target.value)}
                    className="bg-nord-panel border border-nord-border rounded-lg px-2 py-1 text-xs text-white outline-none"
                  >
                    {IDEA_STATUS_OPTIONS.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => promote(idea)}
                      title="Transformar em tarefa"
                      className="flex items-center gap-1 text-xs text-nord-blue-light hover:text-white"
                    >
                      <Sparkles size={13} /> {promoted === idea.id ? "Tarefa criada!" : "Promover"}
                    </button>
                    <button onClick={() => setConfirmDeleteId(idea.id)} className="text-nord-gray hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {ideas.length === 0 && (
          <p className="text-sm text-nord-gray col-span-full text-center py-8">Nenhuma ideia registrada ainda.</p>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nova ideia" widthClass="max-w-2xl">
        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Título</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Descrição</span>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input min-h-16" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Categoria</span>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
              <option value="">—</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Etiquetas</span>
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="input" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Referências</span>
            <textarea value={form.references} onChange={(e) => setForm({ ...form, references: e.target.value })} className="input min-h-14" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Links (fotos, vídeos, referências)</span>
            <input value={form.links} onChange={(e) => setForm({ ...form, links: e.target.value })} className="input" />
          </label>
        </div>
        <button
          onClick={submit}
          disabled={!form.title.trim()}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          Salvar
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir ideia"
        message="Tem certeza que deseja excluir esta ideia?"
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
    </div>
  );
}
