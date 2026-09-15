"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { COURSE_CATEGORY_OPTIONS, COURSE_STATUS_OPTIONS, MODULE_TYPE_OPTIONS, QUESTION_TYPE_OPTIONS } from "@/lib/university";
import type { CourseDTO } from "./university-types";

// Fase 2 (dado/API) trocou a hierarquia de Curso -> Aula (flat) para
// Curso -> Módulo -> Aula, com avaliação por módulo. A tela foi adaptada ao
// mínimo pra continuar funcionando corretamente com o formato novo — cada
// módulo agora é um card que expande pra editar suas aulas e sua avaliação
// (antes eram 2 abas separadas no nível do curso). O refinamento visual
// (drag & drop de verdade, melhor indicação de progresso etc.) fica pra
// Fase 3.

type LessonForm = {
  id?: string;
  title: string;
  type: string;
  videoUrl: string;
  durationSeconds: string;
  pdfUrl: string;
  content: string;
};

type OptionForm = { text: string; correct: boolean };
type QuestionForm = { text: string; type: string; options: OptionForm[] };

type ModuleForm = {
  id?: string;
  title: string;
  description: string;
  cargaHoraria: string;
  lessons: LessonForm[];
  hasQuiz: boolean;
  minScore: string;
  maxAttempts: string;
  questions: QuestionForm[];
};

const emptyLesson: LessonForm = { title: "", type: "VIDEO", videoUrl: "", durationSeconds: "", pdfUrl: "", content: "" };
const emptyQuestion: QuestionForm = {
  text: "",
  type: "MULTIPLA_ESCOLHA",
  options: [
    { text: "", correct: true },
    { text: "", correct: false },
  ],
};
const emptyModule: ModuleForm = {
  title: "",
  description: "",
  cargaHoraria: "",
  lessons: [{ ...emptyLesson }],
  hasQuiz: false,
  minScore: "90",
  maxAttempts: "3",
  questions: [{ ...emptyQuestion }],
};

export function CourseBuilderModal({
  open,
  onClose,
  onSaved,
  course,
  empresas,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  course?: CourseDTO | null;
  empresas: { id: string; name: string }[];
}) {
  const [tab, setTab] = useState<"info" | "modulos">("info");
  const [name, setName] = useState(course?.name ?? "");
  const [category, setCategory] = useState(course?.category ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [cargo, setCargo] = useState(course?.cargo ?? "");
  const [empresaId, setEmpresaId] = useState(course?.empresaId ?? "");
  const [instructor, setInstructor] = useState(course?.instructor ?? "");
  const [cargaHoraria, setCargaHoraria] = useState(String(course?.cargaHoraria ?? ""));
  const [status, setStatus] = useState(course?.status ?? "RASCUNHO");
  const [mandatory, setMandatory] = useState(course?.mandatory ?? false);
  const [imageUrl, setImageUrl] = useState(course?.imageUrl ?? "");

  const [modules, setModules] = useState<ModuleForm[]>(
    course?.modules?.length
      ? course.modules.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description ?? "",
          cargaHoraria: String(m.cargaHoraria || ""),
          lessons: m.lessons.length
            ? m.lessons.map((l) => ({
                id: l.id,
                title: l.title,
                type: l.type,
                videoUrl: l.videoUrl ?? "",
                durationSeconds: String(l.durationSeconds || ""),
                pdfUrl: l.pdfUrl ?? "",
                content: l.content ?? "",
              }))
            : [{ ...emptyLesson }],
          hasQuiz: !!m.quiz,
          minScore: String(m.quiz?.minScore ?? 90),
          maxAttempts: String(m.quiz?.maxAttempts ?? 3),
          questions: m.quiz?.questions?.length
            ? m.quiz.questions.map((q) => ({
                text: q.text,
                type: q.type,
                options: q.options.map((o) => ({ text: o.text, correct: o.correct })),
              }))
            : [{ ...emptyQuestion }],
        }))
      : [{ ...emptyModule }]
  );
  const [expandedModule, setExpandedModule] = useState<number | null>(0);

  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function updateModule(idx: number, patch: Partial<ModuleForm>) {
    setModules((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }
  function addModule() {
    setModules((prev) => [...prev, { ...emptyModule, lessons: [{ ...emptyLesson }], questions: [{ ...emptyQuestion }] }]);
    setExpandedModule(modules.length);
  }
  function removeModule(idx: number) {
    setModules((prev) => prev.filter((_, i) => i !== idx));
    setExpandedModule(null);
  }

  function updateLesson(modIdx: number, lessonIdx: number, patch: Partial<LessonForm>) {
    setModules((prev) =>
      prev.map((m, i) =>
        i !== modIdx ? m : { ...m, lessons: m.lessons.map((l, j) => (j === lessonIdx ? { ...l, ...patch } : l)) }
      )
    );
  }
  function addLesson(modIdx: number) {
    setModules((prev) => prev.map((m, i) => (i === modIdx ? { ...m, lessons: [...m.lessons, { ...emptyLesson }] } : m)));
  }
  function removeLesson(modIdx: number, lessonIdx: number) {
    setModules((prev) =>
      prev.map((m, i) => (i !== modIdx ? m : { ...m, lessons: m.lessons.filter((_, j) => j !== lessonIdx) }))
    );
  }

  async function handleVideoUpload(modIdx: number, lessonIdx: number, file: File) {
    const key = `${modIdx}-${lessonIdx}`;
    setUploadingKey(key);
    setUploadError(null);
    try {
      const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
      updateLesson(modIdx, lessonIdx, { videoUrl: blob.url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha ao enviar o vídeo.");
    } finally {
      setUploadingKey(null);
    }
  }

  function updateQuestion(modIdx: number, qIdx: number, patch: Partial<QuestionForm>) {
    setModules((prev) =>
      prev.map((m, i) =>
        i !== modIdx ? m : { ...m, questions: m.questions.map((q, j) => (j === qIdx ? { ...q, ...patch } : q)) }
      )
    );
  }
  function addQuestion(modIdx: number) {
    setModules((prev) =>
      prev.map((m, i) =>
        i !== modIdx
          ? m
          : { ...m, questions: [...m.questions, { ...emptyQuestion, options: [{ text: "", correct: true }, { text: "", correct: false }] }] }
      )
    );
  }
  function removeQuestion(modIdx: number, qIdx: number) {
    setModules((prev) =>
      prev.map((m, i) => (i !== modIdx ? m : { ...m, questions: m.questions.filter((_, j) => j !== qIdx) }))
    );
  }
  function updateOption(modIdx: number, qIdx: number, oIdx: number, patch: Partial<OptionForm>) {
    setModules((prev) =>
      prev.map((m, i) =>
        i !== modIdx
          ? m
          : {
              ...m,
              questions: m.questions.map((q, j) =>
                j !== qIdx
                  ? q
                  : {
                      ...q,
                      options: q.options.map((o, k) =>
                        k === oIdx ? { ...o, ...patch } : patch.correct !== undefined && q.type === "MULTIPLA_ESCOLHA" ? { ...o, correct: false } : o
                      ),
                    }
              ),
            }
      )
    );
  }
  function addOption(modIdx: number, qIdx: number) {
    setModules((prev) =>
      prev.map((m, i) =>
        i !== modIdx
          ? m
          : { ...m, questions: m.questions.map((q, j) => (j === qIdx ? { ...q, options: [...q.options, { text: "", correct: false }] } : q)) }
      )
    );
  }
  function removeOption(modIdx: number, qIdx: number, oIdx: number) {
    setModules((prev) =>
      prev.map((m, i) =>
        i !== modIdx
          ? m
          : { ...m, questions: m.questions.map((q, j) => (j === qIdx ? { ...q, options: q.options.filter((_, k) => k !== oIdx) } : q)) }
      )
    );
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      const modulesPayload = modules
        .filter((m) => m.title.trim())
        .map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description || undefined,
          cargaHoraria: Number(m.cargaHoraria) || 0,
          lessons: m.lessons
            .filter((l) => l.title.trim())
            .map((l) => ({
              id: l.id,
              title: l.title,
              type: l.type,
              videoUrl: l.videoUrl || undefined,
              durationSeconds: Number(l.durationSeconds) || 0,
              pdfUrl: l.pdfUrl || undefined,
              content: l.content || undefined,
            })),
          quiz: m.hasQuiz
            ? {
                minScore: Number(m.minScore) || 90,
                maxAttempts: Number(m.maxAttempts) || 3,
                questions: m.questions
                  .filter((q) => q.text.trim())
                  .map((q) => ({
                    text: q.text,
                    type: q.type,
                    options: q.type === "DISSERTATIVA" ? [] : q.options.filter((o) => o.text.trim()),
                  })),
              }
            : null,
        }));

      const infoPayload = {
        name,
        category: category || null,
        description,
        cargo: cargo || null,
        empresaId: empresaId || null,
        instructor,
        cargaHoraria: Number(cargaHoraria) || 0,
        status,
        mandatory,
        imageUrl,
      };

      let courseId = course?.id;
      if (course) {
        await fetch(`/api/university/courses/${course.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...infoPayload, modules: modulesPayload }),
        });
      } else {
        const res = await fetch("/api/university/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(infoPayload),
        });
        const data = await res.json();
        courseId = data.course?.id;
        if (courseId) {
          await fetch(`/api/university/courses/${courseId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modules: modulesPayload }),
          });
        }
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={course ? "Editar curso" : "Novo curso"} widthClass="max-w-4xl">
      <div className="flex gap-1.5 mb-4 border-b border-nord-border pb-3">
        {[
          { key: "info", label: "Informações" },
          { key: "modulos", label: `Módulos (${modules.filter((m) => m.title.trim()).length})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tab === t.key ? "bg-nord-blue text-white" : "text-nord-gray hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Nome do curso</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Descrição</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-16" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Categoria</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
              <option value="">—</option>
              {COURSE_CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Cargo alvo</span>
            <input value={cargo} onChange={(e) => setCargo(e.target.value)} className="input" placeholder="Ex: Garçom, Cozinha..." />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Loja</span>
            <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className="input">
              <option value="">Compartilhado (todas as lojas)</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Instrutor</span>
            <input value={instructor} onChange={(e) => setInstructor(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Carga horária (minutos)</span>
            <input type="number" value={cargaHoraria} onChange={(e) => setCargaHoraria(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
              {COURSE_STATUS_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Imagem de capa (URL)</span>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="input" />
          </label>
          <label className="flex items-center gap-2 mt-1">
            <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} className="accent-nord-blue" />
            <span className="text-sm text-white">Curso obrigatório</span>
          </label>
        </div>
      )}

      {tab === "modulos" && (
        <div className="space-y-3">
          {uploadError && <p className="text-xs text-nord-danger">{uploadError}</p>}
          {modules.map((m, modIdx) => {
            const expanded = expandedModule === modIdx;
            return (
              <div key={modIdx} className="nord-card p-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setExpandedModule(expanded ? null : modIdx)} className="text-nord-gray hover:text-white shrink-0">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <GripVertical size={14} className="text-nord-gray/50 shrink-0" />
                  <input
                    value={m.title}
                    onChange={(e) => updateModule(modIdx, { title: e.target.value })}
                    placeholder={`Título do módulo ${modIdx + 1}`}
                    className="input flex-1"
                  />
                  <span className="text-[11px] text-nord-gray whitespace-nowrap px-1">
                    {m.lessons.filter((l) => l.title.trim()).length} aula(s){m.hasQuiz ? " · com avaliação" : ""}
                  </span>
                  <button onClick={() => removeModule(modIdx)} className="text-nord-gray hover:text-nord-danger shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>

                {expanded && (
                  <div className="mt-3 pl-6 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="block text-xs text-nord-gray mb-1">Descrição do módulo</span>
                        <input
                          value={m.description}
                          onChange={(e) => updateModule(modIdx, { description: e.target.value })}
                          className="input"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-xs text-nord-gray mb-1">Carga horária (minutos)</span>
                        <input
                          type="number"
                          value={m.cargaHoraria}
                          onChange={(e) => updateModule(modIdx, { cargaHoraria: e.target.value })}
                          className="input"
                        />
                      </label>
                    </div>

                    <div>
                      <p className="text-xs text-nord-gray mb-1.5">Aulas (vídeo/categoria dentro do módulo)</p>
                      <div className="space-y-2">
                        {m.lessons.map((l, lessonIdx) => (
                          <div key={lessonIdx} className="nord-card p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <GripVertical size={14} className="text-nord-gray/50" />
                              <input
                                value={l.title}
                                onChange={(e) => updateLesson(modIdx, lessonIdx, { title: e.target.value })}
                                placeholder="Título da aula"
                                className="input flex-1"
                              />
                              <select
                                value={l.type}
                                onChange={(e) => updateLesson(modIdx, lessonIdx, { type: e.target.value })}
                                className="input w-44"
                              >
                                {MODULE_TYPE_OPTIONS.map((t) => (
                                  <option key={t.key} value={t.key}>{t.label}</option>
                                ))}
                              </select>
                              <button onClick={() => removeLesson(modIdx, lessonIdx)} className="text-nord-gray hover:text-nord-danger shrink-0">
                                <Trash2 size={14} />
                              </button>
                            </div>
                            {l.type === "VIDEO" && (
                              <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                  <input
                                    value={l.videoUrl}
                                    onChange={(e) => updateLesson(modIdx, lessonIdx, { videoUrl: e.target.value })}
                                    placeholder="URL do vídeo (mp4, YouTube embed...)"
                                    className="input col-span-2"
                                  />
                                  <input
                                    type="number"
                                    value={l.durationSeconds}
                                    onChange={(e) => updateLesson(modIdx, lessonIdx, { durationSeconds: e.target.value })}
                                    placeholder="Duração (segundos)"
                                    className="input"
                                  />
                                </div>
                                <label className="inline-flex items-center gap-1.5 text-xs text-nord-blue-light hover:text-white cursor-pointer">
                                  {uploadingKey === `${modIdx}-${lessonIdx}` ? "Enviando vídeo..." : "ou enviar arquivo de vídeo"}
                                  <input
                                    type="file"
                                    accept="video/*"
                                    className="hidden"
                                    disabled={uploadingKey !== null}
                                    onChange={(e) => e.target.files?.[0] && handleVideoUpload(modIdx, lessonIdx, e.target.files[0])}
                                  />
                                </label>
                              </div>
                            )}
                            {l.type === "PDF" && (
                              <input
                                value={l.pdfUrl}
                                onChange={(e) => updateLesson(modIdx, lessonIdx, { pdfUrl: e.target.value })}
                                placeholder="URL do PDF"
                                className="input"
                              />
                            )}
                            {(l.type === "CHECKLIST" || l.type === "LINK") && (
                              <textarea
                                value={l.content}
                                onChange={(e) => updateLesson(modIdx, lessonIdx, { content: e.target.value })}
                                placeholder={l.type === "CHECKLIST" ? "Um item por linha" : "Links e observações"}
                                className="input min-h-14"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                      <button onClick={() => addLesson(modIdx)} className="flex items-center gap-1.5 text-xs text-nord-blue-light hover:text-white mt-2">
                        <Plus size={13} /> Adicionar aula
                      </button>
                    </div>

                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={m.hasQuiz}
                          onChange={(e) => updateModule(modIdx, { hasQuiz: e.target.checked })}
                          className="accent-nord-blue"
                        />
                        <span className="text-sm text-white">Este módulo tem avaliação (obrigatória pra emitir certificado)</span>
                      </label>

                      {m.hasQuiz && (
                        <div className="mt-2 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                              <span className="block text-xs text-nord-gray mb-1">Nota mínima para aprovação (%)</span>
                              <input
                                type="number"
                                value={m.minScore}
                                onChange={(e) => updateModule(modIdx, { minScore: e.target.value })}
                                className="input"
                              />
                            </label>
                            <label className="block">
                              <span className="block text-xs text-nord-gray mb-1">Tentativas permitidas</span>
                              <input
                                type="number"
                                value={m.maxAttempts}
                                onChange={(e) => updateModule(modIdx, { maxAttempts: e.target.value })}
                                className="input"
                              />
                            </label>
                          </div>

                          {m.questions.map((q, qIdx) => (
                            <div key={qIdx} className="nord-card p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <input
                                  value={q.text}
                                  onChange={(e) => updateQuestion(modIdx, qIdx, { text: e.target.value })}
                                  placeholder="Pergunta"
                                  className="input flex-1"
                                />
                                <select
                                  value={q.type}
                                  onChange={(e) => updateQuestion(modIdx, qIdx, { type: e.target.value })}
                                  className="input w-44"
                                >
                                  {QUESTION_TYPE_OPTIONS.map((t) => (
                                    <option key={t.key} value={t.key}>{t.label}</option>
                                  ))}
                                </select>
                                <button onClick={() => removeQuestion(modIdx, qIdx)} className="text-nord-gray hover:text-nord-danger shrink-0">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              {q.type !== "DISSERTATIVA" && (
                                <div className="space-y-1.5 ml-2">
                                  {q.options.map((o, oIdx) => (
                                    <div key={oIdx} className="flex items-center gap-2">
                                      <input
                                        type="radio"
                                        checked={o.correct}
                                        onChange={() => updateOption(modIdx, qIdx, oIdx, { correct: true })}
                                        className="accent-nord-success"
                                      />
                                      <input
                                        value={o.text}
                                        onChange={(e) => updateOption(modIdx, qIdx, oIdx, { text: e.target.value })}
                                        placeholder="Alternativa"
                                        className="input flex-1"
                                      />
                                      <button onClick={() => removeOption(modIdx, qIdx, oIdx)} className="text-nord-gray hover:text-nord-danger">
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  ))}
                                  <button onClick={() => addOption(modIdx, qIdx)} className="text-[11px] text-nord-blue-light hover:text-white">
                                    + Adicionar alternativa
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                          <button onClick={() => addQuestion(modIdx)} className="flex items-center gap-1.5 text-xs text-nord-blue-light hover:text-white">
                            <Plus size={13} /> Adicionar pergunta
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={addModule} className="flex items-center gap-1.5 text-xs text-nord-blue-light hover:text-white">
            <Plus size={13} /> Adicionar módulo
          </button>
        </div>
      )}

      <button
        onClick={submit}
        disabled={!name.trim() || saving}
        className="w-full mt-5 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
      >
        {saving ? "Salvando..." : "Salvar curso"}
      </button>

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
    </Modal>
  );
}
