"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, Copy, Check } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { format } from "date-fns";

type VaultEntryDTO = {
  id: string;
  systemName: string;
  site: string | null;
  username: string;
  category: string;
  responsavel: string | null;
  observacao: string | null;
  updatedAt: string;
  createdBy: string;
};

const emptyForm = {
  systemName: "",
  site: "",
  username: "",
  password: "",
  category: "Geral",
  responsavel: "",
  observacao: "",
};

export function SenhasClient({ initialEntries }: { initialEntries: VaultEntryDTO[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VaultEntryDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/vault");
    const data = await res.json();
    setEntries(data.entries);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(e: VaultEntryDTO) {
    setEditing(e);
    setForm({
      systemName: e.systemName,
      site: e.site ?? "",
      username: e.username,
      password: "",
      category: e.category,
      responsavel: e.responsavel ?? "",
      observacao: e.observacao ?? "",
    });
    setShowForm(true);
  }

  async function submit() {
    if (editing) {
      await fetch(`/api/admin/vault/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/admin/vault", {
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
    await fetch(`/api/admin/vault/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  async function toggleReveal(id: string) {
    if (revealed[id]) {
      setRevealed((r) => {
        const next = { ...r };
        delete next[id];
        return next;
      });
      return;
    }
    const res = await fetch(`/api/admin/vault/${id}?action=VIEW`);
    const data = await res.json();
    setRevealed((r) => ({ ...r, [id]: data.password }));
  }

  async function copyPassword(id: string) {
    const res = await fetch(`/api/admin/vault/${id}?action=COPY`);
    const data = await res.json();
    await navigator.clipboard.writeText(data.password);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <Section
      title="Senhas cadastradas"
      action={
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
        >
          <Plus size={13} /> Nova senha
        </button>
      }
    >
      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Sistema</th>
              <th className="py-2 pr-4">Usuário</th>
              <th className="py-2 pr-4">Senha</th>
              <th className="py-2 pr-4">Categoria</th>
              <th className="py-2 pr-4">Responsável</th>
              <th className="py-2 pr-4">Atualizado</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 pr-4 text-white">
                  {e.site ? (
                    <a href={e.site} target="_blank" rel="noreferrer" className="hover:underline">
                      {e.systemName}
                    </a>
                  ) : (
                    e.systemName
                  )}
                </td>
                <td className="py-2.5 pr-4 text-nord-gray">{e.username}</td>
                <td className="py-2.5 pr-4 text-nord-gray font-mono">
                  <div className="flex items-center gap-2">
                    <span>{revealed[e.id] ?? "••••••••"}</span>
                    <button onClick={() => toggleReveal(e.id)} className="text-nord-gray hover:text-white">
                      {revealed[e.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button onClick={() => copyPassword(e.id)} className="text-nord-gray hover:text-white">
                      {copiedId === e.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                </td>
                <td className="py-2.5 pr-4">
                  <Badge>{e.category}</Badge>
                </td>
                <td className="py-2.5 pr-4 text-nord-gray">{e.responsavel}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{format(new Date(e.updatedAt), "dd/MM/yyyy")}</td>
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(e)} className="text-nord-gray hover:text-white">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDeleteId(e.id)} className="text-nord-gray hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar senha" : "Nova senha"}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome do sistema">
            <input value={form.systemName} onChange={(e) => setForm({ ...form, systemName: e.target.value })} className="input" />
          </Field>
          <Field label="Site">
            <input value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} className="input" />
          </Field>
          <Field label="Usuário">
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="input" />
          </Field>
          <Field label={editing ? "Nova senha (deixe em branco para manter)" : "Senha"}>
            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" />
          </Field>
          <Field label="Categoria">
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input" />
          </Field>
          <Field label="Responsável">
            <input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} className="input" />
          </Field>
          <div className="col-span-2">
            <Field label="Observação">
              <textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} className="input min-h-14" />
            </Field>
          </div>
        </div>
        <button onClick={submit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir senha"
        message="Tem certeza que deseja excluir esta senha do cofre?"
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
