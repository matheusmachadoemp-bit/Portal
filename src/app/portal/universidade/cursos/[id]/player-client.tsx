"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, Video, FileText, ListChecks, Link as LinkIcon, Award, RotateCcw } from "lucide-react";
import { ProgressBar, Badge } from "@/components/ui/stat-card";
import { MIN_WATCH_PERCENT_TO_COMPLETE } from "@/lib/university";
import type { CourseDTO } from "../../university-types";

// Fase 2 (dado/API) trocou a hierarquia de Curso -> Aula (flat) para
// Curso -> Módulo -> Aula, com avaliação/certificado por módulo. Este
// componente foi adaptado ao mínimo pra continuar funcionando corretamente
// com o formato novo (aulas agrupadas por módulo na barra lateral, uma
// avaliação por módulo, um certificado por módulo concluído) — o
// refinamento visual (layout dos grupos, indicação de progresso por módulo
// etc.) fica pra Fase 3.

const TYPE_ICON: Record<string, typeof Video> = { VIDEO: Video, PDF: FileText, CHECKLIST: ListChecks, LINK: LinkIcon };

type LessonProg = { lessonId: string; percentWatched: number; completed: boolean };
type ModuleEnrollmentInfo = {
  moduleId: string;
  status: string;
  certificateCode: string | null;
  attemptsUsed: number;
};
type EnrollmentInfo = {
  id: string;
  status: string;
};

export function PlayerClient({
  course,
  enrollment,
  moduleEnrollments,
  lessonProgress,
}: {
  course: CourseDTO;
  enrollment: EnrollmentInfo;
  moduleEnrollments: ModuleEnrollmentInfo[];
  lessonProgress: LessonProg[];
}) {
  const router = useRouter();
  const allLessons = course.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleId: m.id })));
  const initialLessonId =
    allLessons.find((l) => !lessonProgress.find((p) => p.lessonId === l.id)?.completed)?.id ??
    allLessons[0]?.id ??
    null;

  const [activeLessonId, setActiveLessonId] = useState(initialLessonId);
  const [activeQuizModuleId, setActiveQuizModuleId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState(new Map(lessonProgress.map((p) => [p.lessonId, p])));
  const [quizResult, setQuizResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTickRef = useRef<number | null>(null);
  const pendingDeltaRef = useRef(0);

  const activeLesson = allLessons.find((l) => l.id === activeLessonId) ?? null;
  const activeQuizModule = course.modules.find((m) => m.id === activeQuizModuleId) ?? null;
  const moduleEnrollmentByModuleId = new Map(moduleEnrollments.map((me) => [me.moduleId, me]));

  const overallPercent = allLessons.length
    ? Math.round(([...progressMap.values()].filter((p) => p.completed).length / allLessons.length) * 100)
    : 0;

  const certificates = moduleEnrollments.filter((me) => me.certificateCode);

  async function sendProgress(lessonId: string, deltaSeconds: number, started = false) {
    const res = await fetch("/api/university/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, deltaSeconds, device: "web", started }),
    });
    const data = await res.json();
    if (data.progress) {
      setProgressMap((prev) =>
        new Map(prev).set(lessonId, {
          lessonId,
          percentWatched: data.progress.percentWatched,
          completed: data.progress.completed,
        })
      );
    }
    if (data.moduleEnrollment?.status === "CONCLUIDO") router.refresh();
  }

  function flushPendingDelta(lessonId: string) {
    if (pendingDeltaRef.current > 0) {
      const delta = pendingDeltaRef.current;
      pendingDeltaRef.current = 0;
      sendProgress(lessonId, delta);
    }
  }

  useEffect(() => {
    lastTickRef.current = null;
    pendingDeltaRef.current = 0;
  }, [activeLessonId]);

  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video || !activeLesson) return;
    // eslint-disable-next-line react-hooks/purity -- Date.now() is read only from a DOM event handler, never during render
    const now = Date.now();
    if (lastTickRef.current !== null && !video.paused && !video.seeking) {
      const elapsed = (now - lastTickRef.current) / 1000;
      if (elapsed > 0 && elapsed < 2) pendingDeltaRef.current += elapsed;
    }
    lastTickRef.current = now;
    if (pendingDeltaRef.current >= 5) flushPendingDelta(activeLesson.id);
  }

  function onPause() {
    if (activeLesson) flushPendingDelta(activeLesson.id);
    lastTickRef.current = null;
  }

  function onPlay() {
    if (activeLesson) sendProgress(activeLesson.id, 0, true);
    // eslint-disable-next-line react-hooks/purity -- Date.now() is read only from a DOM event handler, never during render
    lastTickRef.current = Date.now();
  }

  async function markManualComplete(lessonId: string, durationSeconds: number) {
    await sendProgress(lessonId, Math.max(durationSeconds, 60));
  }

  async function submitQuiz() {
    if (!activeQuizModule?.quiz) return;
    setSubmitting(true);
    setQuizError(null);
    const payload = {
      answers: Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId })),
    };
    const res = await fetch(`/api/university/quiz/${activeQuizModule.quiz.id}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setQuizError(data.error ?? "Não foi possível enviar a avaliação.");
      return;
    }
    setQuizResult({ score: data.attempt.score, passed: data.attempt.passed });
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6">
      <div className="nord-card p-3 h-fit">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-nord-gray">Progresso do curso</p>
          {enrollment.status === "CONCLUIDO" && <Badge tone="success">Curso concluído</Badge>}
        </div>
        <ProgressBar percent={overallPercent} />
        <p className="text-[11px] text-nord-gray mt-1 mb-3">{overallPercent}% concluído</p>
        <div className="space-y-3">
          {course.modules.length === 0 && (
            <p className="text-xs text-nord-gray px-2.5 py-2">Nenhum módulo cadastrado ainda.</p>
          )}
          {course.modules.map((mod) => {
            const moduleLessonsCompleted =
              mod.lessons.length > 0 && mod.lessons.every((l) => progressMap.get(l.id)?.completed);
            const moduleEnrollment = moduleEnrollmentByModuleId.get(mod.id);
            return (
              <div key={mod.id}>
                <p className="text-[10px] uppercase tracking-wide text-nord-gray/70 px-2.5 mb-1">{mod.title}</p>
                <div className="space-y-1">
                  {mod.lessons.length === 0 && (
                    <p className="text-xs text-nord-gray/70 px-2.5 py-1">Nenhuma aula cadastrada.</p>
                  )}
                  {mod.lessons.map((l) => {
                    const Icon = TYPE_ICON[l.type] ?? Video;
                    const prog = progressMap.get(l.id);
                    const active = l.id === activeLessonId && !activeQuizModuleId;
                    return (
                      <button
                        key={l.id}
                        onClick={() => {
                          setActiveLessonId(l.id);
                          setActiveQuizModuleId(null);
                        }}
                        className={`w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-xs ${
                          active ? "bg-nord-blue/15 text-white" : "text-nord-gray hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {prog?.completed ? (
                          <CheckCircle2 size={14} className="text-nord-success shrink-0" />
                        ) : (
                          <Circle size={14} className="shrink-0" />
                        )}
                        <Icon size={13} className="shrink-0" />
                        <span className="truncate flex-1">{l.title}</span>
                      </button>
                    );
                  })}
                  {mod.quiz && mod.quiz.questions.length > 0 && (
                    <button
                      onClick={() => setActiveQuizModuleId(mod.id)}
                      disabled={!moduleLessonsCompleted}
                      className={`w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-xs disabled:opacity-40 ${
                        activeQuizModuleId === mod.id ? "bg-nord-blue/15 text-white" : "text-nord-gray hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <Award size={14} className="shrink-0" />
                      <span className="flex-1">Avaliação do módulo</span>
                      {moduleEnrollment?.certificateCode && <CheckCircle2 size={12} className="text-nord-success shrink-0" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {certificates.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {certificates.map((c) => (
              <Link
                key={c.moduleId}
                href={`/certificado/${c.certificateCode}`}
                target="_blank"
                className="flex items-center justify-center gap-1.5 text-xs bg-nord-success/20 text-nord-success rounded-lg py-2 font-medium hover:bg-nord-success/30"
              >
                <Award size={13} /> Ver certificado
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="nord-card p-5">
        {!activeQuizModule && !activeLesson && (
          <p className="text-sm text-nord-gray">
            Este curso ainda não possui aulas cadastradas. Volte em breve ou entre em contato com a equipe de treinamento.
          </p>
        )}

        {!activeQuizModule && activeLesson && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-medium">{activeLesson.title}</h3>
              {progressMap.get(activeLesson.id)?.completed && <Badge tone="success">Concluído</Badge>}
            </div>

            {activeLesson.type === "VIDEO" && activeLesson.videoUrl && (
              <video
                ref={videoRef}
                src={activeLesson.videoUrl}
                controls
                controlsList="nodownload"
                className="w-full rounded-lg bg-black max-h-[480px]"
                onTimeUpdate={onTimeUpdate}
                onPause={onPause}
                onPlay={onPlay}
                onEnded={() => activeLesson && flushPendingDelta(activeLesson.id)}
              />
            )}
            {activeLesson.type === "VIDEO" && !activeLesson.videoUrl && (
              <p className="text-sm text-nord-gray">Nenhum vídeo configurado para esta aula.</p>
            )}

            {activeLesson.type === "PDF" && (
              <div className="space-y-3">
                {activeLesson.pdfUrl && (
                  <a href={activeLesson.pdfUrl} target="_blank" rel="noreferrer" className="text-nord-blue-light hover:text-white text-sm underline">
                    Abrir material em PDF
                  </a>
                )}
                <button
                  onClick={() => markManualComplete(activeLesson.id, activeLesson.durationSeconds || 60)}
                  disabled={progressMap.get(activeLesson.id)?.completed}
                  className="block bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-xs font-medium rounded-lg px-4 py-2"
                >
                  Marcar como lido / concluído
                </button>
              </div>
            )}

            {(activeLesson.type === "CHECKLIST" || activeLesson.type === "LINK") && (
              <div className="space-y-3">
                <div className="text-sm text-nord-gray whitespace-pre-line nord-card p-3">{activeLesson.content}</div>
                <button
                  onClick={() => markManualComplete(activeLesson.id, activeLesson.durationSeconds || 60)}
                  disabled={progressMap.get(activeLesson.id)?.completed}
                  className="bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-xs font-medium rounded-lg px-4 py-2"
                >
                  Marcar como concluído
                </button>
              </div>
            )}

            <p className="text-[11px] text-nord-gray mt-4">
              A aula é considerada concluída somente ao assistir pelo menos {MIN_WATCH_PERCENT_TO_COMPLETE}% do
              conteúdo. Avançar diretamente para o final não marca como concluída.
            </p>
          </div>
        )}

        {activeQuizModule?.quiz && (
          <div>
            <h3 className="text-white font-medium mb-1">Avaliação — {activeQuizModule.title}</h3>
            <p className="text-xs text-nord-gray mb-4">
              Nota mínima: {activeQuizModule.quiz.minScore}% · Tentativas:{" "}
              {moduleEnrollmentByModuleId.get(activeQuizModule.id)?.attemptsUsed ?? 0}/{activeQuizModule.quiz.maxAttempts}
            </p>

            {quizResult ? (
              <div className={`nord-card p-5 text-center ${quizResult.passed ? "border-nord-success/40" : "border-nord-danger/40"}`}>
                <p className={`text-2xl font-semibold mb-1 ${quizResult.passed ? "text-nord-success" : "text-nord-danger"}`}>{quizResult.score}%</p>
                <p className="text-sm text-white mb-3">{quizResult.passed ? "Aprovado! 🎉" : "Reprovado — reveja o módulo e tente novamente."}</p>
                {!quizResult.passed &&
                  (moduleEnrollmentByModuleId.get(activeQuizModule.id)?.attemptsUsed ?? 0) < activeQuizModule.quiz.maxAttempts && (
                    <button
                      onClick={() => {
                        setQuizResult(null);
                        setAnswers({});
                      }}
                      className="flex items-center gap-1.5 mx-auto text-xs text-nord-blue-light hover:text-white"
                    >
                      <RotateCcw size={13} /> Tentar novamente
                    </button>
                  )}
              </div>
            ) : (
              <div className="space-y-4">
                {activeQuizModule.quiz.questions.map((q, idx) => (
                  <div key={q.id} className="nord-card p-3">
                    <p className="text-sm text-white mb-2">{idx + 1}. {q.text}</p>
                    {q.type === "DISSERTATIVA" ? (
                      <textarea className="input min-h-16" placeholder="Sua resposta (não avaliada automaticamente)" />
                    ) : (
                      <div className="space-y-1.5">
                        {q.options.map((o) => (
                          <label key={o.id} className="flex items-center gap-2 text-sm text-nord-gray">
                            <input
                              type="radio"
                              name={q.id}
                              checked={answers[q.id] === o.id}
                              onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                              className="accent-nord-blue"
                            />
                            {o.text}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {quizError && <p className="text-xs text-nord-danger">{quizError}</p>}
                <button
                  onClick={submitQuiz}
                  disabled={submitting}
                  className="bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2.5"
                >
                  {submitting ? "Enviando..." : "Enviar avaliação"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
