"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, X } from "lucide-react";
import { UniversityTabs } from "../university-tabs";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { formatMinutes } from "@/lib/university";
import type { TrackDTO } from "../university-types";

type CourseOption = { id: string; name: string; cargaHoraria: number };

const emptyForm = { name: "", cargo: "", empresaId: "", description: "", icon: "GraduationCap", color: "#2952E3" };

export function TracksClient({
  initialTracks,
  allCourses,
  empresas,
  isAdmin,
}: {
  initialTracks: TrackDTO[];
  allCourses: CourseOption[];
  empresas: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [tracks, setTracks] = useState(initialTracks);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TrackDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/university/tracks");
    const data = await res.json();
    setTracks(data.tracks);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setCourseIds([]);
    setShowForm(true);
  }

  function openEdit(t: TrackDTO) {
    setEditing(t);
    setForm({
      name: t.name,
      cargo: t.cargo ?? "",
      empresaId: t.empresaId ?? "",
      description: t.description ?? "",
      icon: t.icon,
      color: t.color,
    });
    setCourseIds(t.courses.map((c) => c.courseId));
    setShowForm(true);
  }

  function addCourse(id: string) {
    if (!id || courseIds.includes(id)) return;
    setCourseIds((prev) => [...prev, id]);
  }
  function removeCourse(id: string) {
    setCourseIds((prev) => prev.filter((c) => c !== id));
  }
  function moveCourse(idx: number, dir: -1 | 1) {
    setCourseIds((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function submit() {
    const payload = { ...form, courseIds };
    if (editing) {
      await fetch(`/api/university/tracks/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/university/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setShowForm(false);
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/university/tracks/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  async function enrollInTrack(trackId: string) {
    await fetch("/api/university/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId }),
    });
    router.push("/portal/universidade/videoaulas");
  }

  return (
    <div className="space-y-6">
      <UniversityTabs isAdmin={isAdmin} />

      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Nova trilha
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {tracks.map((t) => {
          const totalMinutes = t.courses.reduce((a, c) => a + c.course.cargaHoraria, 0);
          return (
            <div key={t.id} className="nord-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.color}22` }}>
                  <DynamicIcon name={t.icon} size={16} style={{ color: t.color }} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-white font-medium text-sm truncate">{t.name}</h4>
                  {t.cargo && <p className="text-xs text-nord-gray">{t.cargo}</p>}
                </div>
              </div>
              {t.description && <p className="text-xs text-nord-gray mb-3">{t.description}</p>}
              <p className="text-[11px] text-nord-gray mb-2">
                {t.courses.length} curso(s) · {formatMinutes(totalMinutes)}
              </p>
              <ol className="space-y-1 mb-3">
                {t.courses.map((c, idx) => (
                  <li key={c.courseId} className="text-xs text-nord-gray flex items-center gap-1.5">
                    <span className="text-nord-gray/50">{idx + 1}.</span> {c.course.name}
                  </li>
                ))}
              </ol>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => enrollInTrack(t.id)}
                  className="flex-1 bg-nord-blue hover:bg-nord-blue-light text-white text-xs font-medium rounded-lg py-2"
                >
                  Matricular-me nesta trilha
                </button>
                {isAdmin && (
                  <>
                    <button onClick={() => openEdit(t)} className="text-nord-gray hover:text-white p-2">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDeleteId(t.id)} className="text-nord-gray hover:text-red-400 p-2">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {tracks.length === 0 && <p className="text-sm text-nord-gray col-span-full text-center py-8">Nenhuma trilha cadastrada ainda.</p>}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar trilha" : "Nova trilha"} widthClass="max-w-2xl">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Nome da trilha</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Cargo</span>
              <input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className="input" placeholder="Ex: Garçom" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Loja</span>
              <select value={form.empresaId} onChange={(e) => setForm({ ...form, empresaId: e.target.value })} className="input">
                <option value="">Compartilhada (todas as lojas)</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Descrição</span>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input min-h-14" />
          </label>

          <div>
            <span className="block text-xs text-nord-gray mb-1.5">Cursos da trilha (em ordem)</span>
            <select onChange={(e) => addCourse(e.target.value)} value="" className="input mb-2">
              <option value="">+ Adicionar curso...</option>
              {allCourses.filter((c) => !courseIds.includes(c.id)).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="space-y-1.5">
              {courseIds.map((id, idx) => {
                const course = allCourses.find((c) => c.id === id);
                return (
                  <div key={id} className="flex items-center gap-2 nord-card px-3 py-2">
                    <span className="text-xs text-nord-gray">{idx + 1}.</span>
                    <span className="text-sm text-white flex-1">{course?.name ?? id}</span>
                    <button onClick={() => moveCourse(idx, -1)} className="text-nord-gray hover:text-white">
                      <ArrowUp size={12} />
                    </button>
                    <button onClick={() => moveCourse(idx, 1)} className="text-nord-gray hover:text-white">
                      <ArrowDown size={12} />
                    </button>
                    <button onClick={() => removeCourse(id)} className="text-nord-gray hover:text-red-400">
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <button
          onClick={submit}
          disabled={!form.name.trim()}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          Salvar
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir trilha"
        message="Tem certeza que deseja excluir esta trilha? Os cursos em si não serão excluídos."
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
      `}</style>
    </div>
  );
}
