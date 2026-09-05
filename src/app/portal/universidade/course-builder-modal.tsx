"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { Modal } from "@/components/ui/modal";
import { Plus, Trash2, GripVertical, Upload } from "lucide-react";
import { COURSE_CATEGORY_OPTIONS, COURSE_STATUS_OPTIONS, MODULE_TYPE_OPTIONS, QUESTION_TYPE_OPTIONS } from "@/lib/university";
import type { CourseDTO } from "./university-types";

type ModuleForm = {
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

const emptyModule: ModuleForm = { title: "", type: "VIDEO", videoUrl: "", durationSeconds: "", pdfUrl: "", content: "" };
const emptyQuestion: QuestionForm = {
  text: "",
  type: "MULTIPLA_ESCOLHA",
  options: [
    { text: "", correct: true },
    { text: "", correct: false },
  ],
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
  const [tab, setTab] = useState<"info" | "modulos" | "avaliacao">("info");
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
          type: m.type,
          videoUrl: m.videoUrl ?? "",
          durationSeconds: String(m.durationSeconds || ""),
          pdfUrl: m.pdfUrl ?? "",
          content: m.content ?? "",
        }))
      : [{ ...emptyModule }]
  );

  const [hasQuiz, setHasQuiz] = useState(!!course?.quiz);
  const [minScore, setMinScore] = useState(String(course?.quiz?.minScore ?? 70));
  const [maxAttempts, setMaxAttempts] = useState(String(course?.quiz?.maxAttempts ?? 3));
  const [questions, setQuestions] = useState<QuestionForm[]>(
    course?.quiz?.questions?.length
      ? course.quiz.questions.map((q) => ({
          text: q.text,
          type: q.type,
          options: q.options.map((o) => ({ text: o.text, correct: o.correct })),
        }))
      : [{ ...emptyQuestion }]
  );

  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function updateModule(idx: number, patch: Partial<ModuleForm>) {
    setModules((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  async function handleVideoUpload(idx: number, input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadingIdx(idx);
    try {
      const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
      updateModule(idx, { videoUrl: blob.url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha ao enviar o vídeo.");
    } finally {
      setUploadingIdx(null);
      input.value = "";
    }
  }
  function addModule() {
    setModules((prev) => [...prev, { ...emptyModule }]);
  }
  function removeModule(idx: number) {
    setModules((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateQuestion(idx: number, patch: Partial<QuestionForm>) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }
  function addQuestion() {
    setQuestions((prev) => [...prev, { ...emptyQuestion, options: [{ text: "", correct: true }, { text: "", correct: false }] }]);
  }
  function removeQuestion(idx: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateOption(qIdx: number, oIdx: number, patch: Partial<OptionForm>) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx
          ? q
          : {
              ...q,
              options: q.options.map((o, j) =>
                j === oIdx ? { ...o, ...patch } : patch.correct !== undefined && q.type === "MULTIPLA_ESCOLHA" ? { ...o, correct: false } : o
              ),
            }
      )
    );
  }
  function addOption(qIdx: number) {
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, options: [...q.options, { text: "", correct: false }] } : q)));
  }
  function removeOption(qIdx: number, oIdx: number) {
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, options: q.options.filter((_, j) => j !== oIdx) } : q)));
  }

  async function submit() {
    setSaving(true);
    const payload = {
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
      modules: modules
        .filter((m) => m.title.trim())
        .map((m) => ({
          title: m.title,
          type: m.type,
          videoUrl: m.videoUrl || undefined,
          durationSeconds: Number(m.durationSeconds) || 0,
          pdfUrl: m.pdfUrl || undefined,
          content: m.content || undefined,
        })),
      quiz: hasQuiz
        ? {
            minScore: Number(minScore) || 70,
            maxAttempts: Number(maxAttempts) || 3,
            questions: questions
              .filter((q) => q.text.trim())
              .map((q) => ({
                text: q.text,
                type: q.type,
                options: q.type === "DISSERTATIVA" ? [] : q.options.filter((o) => o.text.trim()),
              })),
          }
        : null,
    };

    let courseId = course?.id;
    if (course) {
      await fetch(`/api/university/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      const res = await fetch("/api/university/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      courseId = data.course?.id;
      if (courseId) {
        await fetch(`/api/university/courses/${courseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modules: payload.modules, quiz: payload.quiz }),
        });
      }
    }
    setSaving(false);
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={course ? "Editar curso" : "Novo curso"} widthClass="max-w-4xl">
      <div className="flex gap-1.5 mb-4 border-b border-nord-border pb-3">
        {[
          { key: "info", label: "Informações" },
          { key: "modulos", label: `Módulos (${modules.filter((m) => m.title.trim()).length})` },
          { key: "avaliacao", label: "Avaliação" },
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
          {modules.map((m, idx) => (
            <div key={idx} className="nord-card p-3">
              <div className="flex items-center gap-2 mb-2">
                <GripVertical size={14} className="text-nord-gray/50" />
                <input
                  value={m.title}
                  onChange={(e) => updateModule(idx, { title: e.target.value })}
                  placeholder="Título do módulo/aula"
                  className="input flex-1"
                />
                <select value={m.type} onChange={(e) => updateModule(idx, { type: e.target.value })} className="input w-44">
                  {MODULE_TYPE_OPTIONS.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
                <button onClick={() => removeModule(idx)} className="text-nord-gray hover:text-red-400 shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
              {m.type === "VIDEO" && (
                <div className="grid grid-cols-3 gap-2">
                  {m.videoUrl ? (
                    <div className="input col-span-2 flex items-center justify-between gap-2 text-nord-gray">
                      <span className="truncate">{m.videoUrl}</span>
                      <button
                        type="button"
                        onClick={() => updateModule(idx, { videoUrl: "" })}
                        className="text-nord-gray hover:text-red-400 shrink-0"
                        title="Remover vídeo"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="col-span-2 flex gap-2">
                      <label className="input flex-1 flex items-center justify-center gap-1.5 cursor-pointer text-nord-blue-light hover:text-white">
                        <Upload size={13} />
                        {uploadingIdx === idx ? "Enviando..." : "Enviar vídeo"}
                        <input
                          type="file"
                          accept="video/*"
                          hidden
                          disabled={uploadingIdx === idx}
                          onChange={(e) => handleVideoUpload(idx, e.target)}
                        />
                      </label>
                      <input
                        onChange={(e) => updateModule(idx, { videoUrl: e.target.value })}
                        placeholder="ou cole um link (YouTube embed...)"
                        className="input flex-1"
                      />
                    </div>
                  )}
                  <input
                    type="number"
                    value={m.durationSeconds}
                    onChange={(e) => updateModule(idx, { durationSeconds: e.target.value })}
                    placeholder="Duração (segundos)"
                    className="input"
                  />
                </div>
              )}
              {m.type === "PDF" && (
                <input value={m.pdfUrl} onChange={(e) => updateModule(idx, { pdfUrl: e.target.value })} placeholder="URL do PDF" className="input" />
              )}
              {(m.type === "CHECKLIST" || m.type === "LINK") && (
                <textarea
                  value={m.content}
                  onChange={(e) => updateModule(idx, { content: e.target.value })}
                  placeholder={m.type === "CHECKLIST" ? "Um item por linha" : "Links e observações"}
                  className="input min-h-14"
                />
              )}
            </div>
          ))}
          <button onClick={addModule} className="flex items-center gap-1.5 text-xs text-nord-blue-light hover:text-white">
            <Plus size={13} /> Adicionar módulo
          </button>
          {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
        </div>
      )}

      {tab === "avaliacao" && (
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hasQuiz} onChange={(e) => setHasQuiz(e.target.checked)} className="accent-nord-blue" />
            <span className="text-sm text-white">Este curso possui avaliação obrigatória ao final</span>
          </label>

          {hasQuiz && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Nota mínima para aprovação (%)</span>
                  <input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)} className="input" />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Tentativas permitidas</span>
                  <input type="number" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} className="input" />
                </label>
              </div>

              {questions.map((q, qIdx) => (
                <div key={qIdx} className="nord-card p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={q.text}
                      onChange={(e) => updateQuestion(qIdx, { text: e.target.value })}
                      placeholder="Pergunta"
                      className="input flex-1"
                    />
                    <select value={q.type} onChange={(e) => updateQuestion(qIdx, { type: e.target.value })} className="input w-44">
                      {QUESTION_TYPE_OPTIONS.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                    <button onClick={() => removeQuestion(qIdx)} className="text-nord-gray hover:text-red-400 shrink-0">
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
                            onChange={() => updateOption(qIdx, oIdx, { correct: true })}
                            className="accent-emerald-500"
                          />
                          <input
                            value={o.text}
                            onChange={(e) => updateOption(qIdx, oIdx, { text: e.target.value })}
                            placeholder="Alternativa"
                            className="input flex-1"
                          />
                          <button onClick={() => removeOption(qIdx, oIdx)} className="text-nord-gray hover:text-red-400">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => addOption(qIdx)} className="text-[11px] text-nord-blue-light hover:text-white">
                        + Adicionar alternativa
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addQuestion} className="flex items-center gap-1.5 text-xs text-nord-blue-light hover:text-white">
                <Plus size={13} /> Adicionar pergunta
              </button>
            </>
          )}
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
