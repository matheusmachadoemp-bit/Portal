"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, Video, FileText, ListChecks, Link as LinkIcon, Award, RotateCcw } from "lucide-react";
import { ProgressBar, Badge } from "@/components/ui/stat-card";
import { MIN_WATCH_PERCENT_TO_COMPLETE } from "@/lib/university";
import type { CourseDTO } from "../../university-types";

const TYPE_ICON: Record<string, typeof Video> = { VIDEO: Video, PDF: FileText, CHECKLIST: ListChecks, LINK: LinkIcon };

type ModuleProg = { moduleId: string; percentWatched: number; completed: boolean };
type EnrollmentInfo = {
  id: string;
  status: string;
  progressPercent: number;
  certificateCode: string | null;
  attemptsUsed: number;
};

export function PlayerClient({
  course,
  enrollment,
  moduleProgress,
}: {
  course: CourseDTO;
  enrollment: EnrollmentInfo;
  moduleProgress: ModuleProg[];
}) {
  const router = useRouter();
  const initialModuleId =
    course.modules.find((m) => !moduleProgress.find((p) => p.moduleId === m.id)?.completed)?.id ??
    course.modules[0]?.id ??
    null;
  const [activeModuleId, setActiveModuleId] = useState(initialModuleId);
  const [progressMap, setProgressMap] = useState(new Map(moduleProgress.map((p) => [p.moduleId, p])));
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizResult, setQuizResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTickRef = useRef<number | null>(null);
  const pendingDeltaRef = useRef(0);

  const activeModule = course.modules.find((m) => m.id === activeModuleId) ?? null;
  const allCompleted = course.modules.length > 0 && course.modules.every((m) => progressMap.get(m.id)?.completed);
  const overallPercent = course.modules.length
    ? Math.round(([...progressMap.values()].filter((p) => p.completed).length / course.modules.length) * 100)
    : 0;

  async function sendProgress(moduleId: string, deltaSeconds: number, started = false) {
    const res = await fetch("/api/university/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleId, deltaSeconds, device: "web", started }),
    });
    const data = await res.json();
    if (data.progress) {
      setProgressMap((prev) => new Map(prev).set(moduleId, {
        moduleId,
        percentWatched: data.progress.percentWatched,
        completed: data.progress.completed,
      }));
    }
    if (data.enrollment?.status === "CONCLUIDO") router.refresh();
  }

  function flushPendingDelta(moduleId: string) {
    if (pendingDeltaRef.current > 0) {
      const delta = pendingDeltaRef.current;
      pendingDeltaRef.current = 0;
      sendProgress(moduleId, delta);
    }
  }

  useEffect(() => {
    lastTickRef.current = null;
    pendingDeltaRef.current = 0;
  }, [activeModuleId]);

  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video || !activeModule) return;
    // eslint-disable-next-line react-hooks/purity -- Date.now() is read only from a DOM event handler, never during render
    const now = Date.now();
    if (lastTickRef.current !== null && !video.paused && !video.seeking) {
      const elapsed = (now - lastTickRef.current) / 1000;
      if (elapsed > 0 && elapsed < 2) pendingDeltaRef.current += elapsed;
    }
    lastTickRef.current = now;
    if (pendingDeltaRef.current >= 5) flushPendingDelta(activeModule.id);
  }

  function onPause() {
    if (activeModule) flushPendingDelta(activeModule.id);
    lastTickRef.current = null;
  }

  function onPlay() {
    if (activeModule) sendProgress(activeModule.id, 0, true);
    // eslint-disable-next-line react-hooks/purity -- Date.now() is read only from a DOM event handler, never during render
    lastTickRef.current = Date.now();
  }

  async function markManualComplete(moduleId: string, durationSeconds: number) {
    await sendProgress(moduleId, Math.max(durationSeconds, 60));
  }

  async function submitQuiz() {
    if (!course.quiz) return;
    setSubmitting(true);
    setQuizError(null);
    const payload = {
      answers: Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId })),
    };
    const res = await fetch(`/api/university/quiz/${course.quiz.id}/attempt`, {
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
        <p className="text-xs text-nord-gray mb-1">Progresso do curso</p>
        <ProgressBar percent={overallPercent} />
        <p className="text-[11px] text-nord-gray mt-1 mb-3">{overallPercent}% concluído</p>
        <div className="space-y-1">
          {course.modules.map((m) => {
            const Icon = TYPE_ICON[m.type] ?? Video;
            const prog = progressMap.get(m.id);
            const active = m.id === activeModuleId;
            return (
              <button
                key={m.id}
                onClick={() => {
                  setActiveModuleId(m.id);
                  setShowQuiz(false);
                }}
                className={`w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-xs ${
                  active ? "bg-nord-blue/15 text-white" : "text-nord-gray hover:text-white hover:bg-white/5"
                }`}
              >
                {prog?.completed ? (
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                ) : (
                  <Circle size={14} className="shrink-0" />
                )}
                <Icon size={13} className="shrink-0" />
                <span className="truncate flex-1">{m.title}</span>
              </button>
            );
          })}
          {course.quiz && (
            <button
              onClick={() => setShowQuiz(true)}
              disabled={!allCompleted}
              className={`w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-xs disabled:opacity-40 ${
                showQuiz ? "bg-nord-blue/15 text-white" : "text-nord-gray hover:text-white hover:bg-white/5"
              }`}
            >
              <Award size={14} className="shrink-0" />
              <span className="flex-1">Avaliação final</span>
            </button>
          )}
        </div>

        {enrollment.status === "CONCLUIDO" && enrollment.certificateCode && (
          <Link
            href={`/certificado/${enrollment.certificateCode}`}
            target="_blank"
            className="flex items-center justify-center gap-1.5 mt-3 text-xs bg-emerald-600/20 text-emerald-400 rounded-lg py-2 font-medium hover:bg-emerald-600/30"
          >
            <Award size={13} /> Ver certificado
          </Link>
        )}
      </div>

      <div className="nord-card p-5">
        {!showQuiz && activeModule && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-medium">{activeModule.title}</h3>
              {progressMap.get(activeModule.id)?.completed && <Badge tone="success">Concluído</Badge>}
            </div>

            {activeModule.type === "VIDEO" && activeModule.videoUrl && (
              <video
                ref={videoRef}
                src={activeModule.videoUrl}
                controls
                controlsList="nodownload"
                className="w-full rounded-lg bg-black max-h-[480px]"
                onTimeUpdate={onTimeUpdate}
                onPause={onPause}
                onPlay={onPlay}
                onEnded={() => activeModule && flushPendingDelta(activeModule.id)}
              />
            )}
            {activeModule.type === "VIDEO" && !activeModule.videoUrl && (
              <p className="text-sm text-nord-gray">Nenhum vídeo configurado para este módulo.</p>
            )}

            {activeModule.type === "PDF" && (
              <div className="space-y-3">
                {activeModule.pdfUrl && (
                  <a href={activeModule.pdfUrl} target="_blank" rel="noreferrer" className="text-nord-blue-light hover:text-white text-sm underline">
                    Abrir material em PDF
                  </a>
                )}
                <button
                  onClick={() => markManualComplete(activeModule.id, activeModule.durationSeconds || 60)}
                  disabled={progressMap.get(activeModule.id)?.completed}
                  className="block bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-xs font-medium rounded-lg px-4 py-2"
                >
                  Marcar como lido / concluído
                </button>
              </div>
            )}

            {(activeModule.type === "CHECKLIST" || activeModule.type === "LINK") && (
              <div className="space-y-3">
                <div className="text-sm text-nord-gray whitespace-pre-line nord-card p-3">{activeModule.content}</div>
                <button
                  onClick={() => markManualComplete(activeModule.id, activeModule.durationSeconds || 60)}
                  disabled={progressMap.get(activeModule.id)?.completed}
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

        {showQuiz && course.quiz && (
          <div>
            <h3 className="text-white font-medium mb-1">Avaliação final</h3>
            <p className="text-xs text-nord-gray mb-4">
              Nota mínima: {course.quiz.minScore}% · Tentativas: {enrollment.attemptsUsed}/{course.quiz.maxAttempts}
            </p>

            {quizResult ? (
              <div className={`nord-card p-5 text-center ${quizResult.passed ? "border-emerald-500/40" : "border-red-500/40"}`}>
                <p className={`text-2xl font-semibold mb-1 ${quizResult.passed ? "text-emerald-400" : "text-red-400"}`}>{quizResult.score}%</p>
                <p className="text-sm text-white mb-3">{quizResult.passed ? "Aprovado! 🎉" : "Reprovado — reveja o módulo e tente novamente."}</p>
                {!quizResult.passed && enrollment.attemptsUsed < course.quiz.maxAttempts && (
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
                {course.quiz.questions.map((q, idx) => (
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
                {quizError && <p className="text-xs text-red-400">{quizError}</p>}
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
