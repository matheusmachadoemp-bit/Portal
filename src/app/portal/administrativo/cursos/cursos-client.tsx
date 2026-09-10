"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, ExternalLink, Eye, EyeOff } from "lucide-react";
import { Section, ProgressBar } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { format } from "date-fns";

type CourseDTO = {
  id: string;
  name: string;
  plataforma: string | null;
  link: string | null;
  usuario: string | null;
  hasSenha: boolean;
  responsavel: string | null;
  percentualConcluido: number;
  startDate: string | null;
  prazo: string | null;
  certificadoUrl: string | null;
  observacoes: string | null;
};

const emptyForm = {
  name: "",
  plataforma: "",
  link: "",
  usuario: "",
  senha: "",
  responsavel: "",
  percentualConcluido: "0",
  startDate: "",
  prazo: "",
  certificadoUrl: "",
  observacoes: "",
};

export function CursosClient({ initialCourses }: { initialCourses: CourseDTO[] }) {
  const [courses, setCourses] = useState(initialCourses);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CourseDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [loadingSenha, setLoadingSenha] = useState(false);
  const [senhaError, setSenhaError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    const res = await fetch("/api/admin/courses");
    const data = await res.json();
    setCourses(data.courses);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowFormPassword(false);
    setSenhaError(null);
    setShowForm(true);
  }

  function openEdit(c: CourseDTO) {
    setEditing(c);
    setForm({
      name: c.name,
      plataforma: c.plataforma ?? "",
      link: c.link ?? "",
      usuario: c.usuario ?? "",
      // A listagem nunca traz a senha de verdade (só o indicador hasSenha),
      // então o campo sempre nasce vazio — quem quiser ver o valor atual
      // usa o botão "Ver senha atual" (busca sob demanda).
      senha: "",
      responsavel: c.responsavel ?? "",
      percentualConcluido: String(c.percentualConcluido),
      startDate: c.startDate ? format(new Date(c.startDate), "yyyy-MM-dd") : "",
      prazo: c.prazo ? format(new Date(c.prazo), "yyyy-MM-dd") : "",
      certificadoUrl: c.certificadoUrl ?? "",
      observacoes: c.observacoes ?? "",
    });
    setShowFormPassword(false);
    setSenhaError(null);
    setShowForm(true);
  }

  async function revealCurrentSenha() {
    if (!editing) return;
    setLoadingSenha(true);
    setSenhaError(null);
    try {
      const res = await fetch(`/api/admin/courses/${editing.id}/senha`);
      if (!res.ok) throw new Error("Falha ao buscar a senha");
      const data = await res.json();
      setForm((f) => ({ ...f, senha: data.senha ?? "" }));
      setShowFormPassword(true);
    } catch {
      setSenhaError("Não foi possível carregar a senha atual.");
    } finally {
      setLoadingSenha(false);
    }
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editing) {
        await fetch(`/api/admin/courses/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else {
        await fetch("/api/admin/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      setShowForm(false);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/admin/courses/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <Section
      title="Cursos cadastrados"
      action={
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
        >
          <Plus size={13} /> Novo curso
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {courses.map((c) => (
          <div key={c.id} className="nord-card p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white font-medium text-sm">{c.name}</p>
                <p className="text-xs text-nord-gray">{c.plataforma}</p>
              </div>
              {c.link && (
                <a href={c.link} target="_blank" rel="noreferrer" className="text-nord-gray hover:text-white">
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
            <ProgressBar percent={c.percentualConcluido} />
            <p className="text-xs text-nord-gray">{c.percentualConcluido}% concluído</p>
            <p className="text-xs text-nord-gray">Responsável: {c.responsavel}</p>
            <div className="flex items-center gap-2 pt-2 border-t border-nord-border/60 mt-1">
              <button onClick={() => openEdit(c)} className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-white py-1.5">
                <Pencil size={12} /> Editar
              </button>
              <button onClick={() => setConfirmDeleteId(c.id)} className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-red-400 py-1.5">
                <Trash2 size={12} /> Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar curso" : "Novo curso"}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Nome do curso">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Plataforma">
            <input value={form.plataforma} onChange={(e) => setForm({ ...form, plataforma: e.target.value })} className="input" />
          </Field>
          <Field label="Link">
            <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className="input" />
          </Field>
          <Field label="Usuário">
            <input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} className="input" />
          </Field>
          <Field label="Senha">
            <div className="relative">
              <input
                type={showFormPassword ? "text" : "password"}
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                placeholder={editing?.hasSenha ? "•••••••• (configurada)" : "Deixe em branco se não houver"}
                className="input pr-8"
              />
              <button
                type="button"
                onClick={() => setShowFormPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-nord-gray hover:text-white"
                tabIndex={-1}
              >
                {showFormPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {editing?.hasSenha && (
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={revealCurrentSenha}
                  disabled={loadingSenha}
                  className="text-xs text-nord-blue-light hover:underline disabled:opacity-50"
                >
                  {loadingSenha ? "Carregando..." : "Ver senha atual"}
                </button>
                {senhaError && <span className="text-xs text-red-400">{senhaError}</span>}
              </div>
            )}
          </Field>
          <Field label="Responsável">
            <input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} className="input" />
          </Field>
          <Field label="% concluído">
            <input type="number" value={form.percentualConcluido} onChange={(e) => setForm({ ...form, percentualConcluido: e.target.value })} className="input" />
          </Field>
          <Field label="Data de início">
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input" />
          </Field>
          <Field label="Prazo">
            <input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} className="input" />
          </Field>
          <div className="col-span-2">
            <Field label="Certificado (URL)">
              <input value={form.certificadoUrl} onChange={(e) => setForm({ ...form, certificadoUrl: e.target.value })} className="input" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Observações">
              <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="input min-h-14" />
            </Field>
          </div>
        </div>
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {submitting ? "Salvando..." : "Salvar"}
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir curso"
        message="Tem certeza que deseja excluir este curso?"
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
