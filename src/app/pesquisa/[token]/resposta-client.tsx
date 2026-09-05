"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

type Option = { id: string; texto: string };
type Question = {
  id: string;
  tipo: string;
  titulo: string;
  orientacao: string | null;
  obrigatoria: boolean;
  opcoes: Option[];
};
type Survey = {
  id: string;
  title: string;
  description: string | null;
  anonima: boolean;
  permitirComentarioAdicional: boolean;
  embaralharPerguntas: boolean;
  exibirResultadoColaborador: boolean;
  perguntas: Question[];
};
type Answer = { valorNumero?: number; valorTexto?: string; valorBooleano?: boolean; optionId?: string; optionIds?: string[] };

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isAnswered(a: Answer | undefined) {
  if (!a) return false;
  return (
    a.valorNumero != null ||
    (a.valorTexto != null && a.valorTexto.trim() !== "") ||
    a.valorBooleano != null ||
    a.optionId != null ||
    (a.optionIds != null && a.optionIds.length > 0)
  );
}

export function RespostaClient({ token, survey, empresa }: { token: string; survey: Survey; empresa: { name: string; color: string } }) {
  const perguntas = useMemo(() => (survey.embaralharPerguntas ? shuffle(survey.perguntas) : survey.perguntas), [survey]);
  const totalSteps = perguntas.length + 1; // +1 = tela de comentário/revisão final

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const isCommentStep = step === perguntas.length;
  const current = isCommentStep ? null : perguntas[step];

  function updateAnswer(questionId: string, patch: Answer) {
    setAnswers((a) => ({ ...a, [questionId]: { ...a[questionId], ...patch } }));
    setError(null);
  }

  function goNext() {
    if (current && current.obrigatoria && !isAnswered(answers[current.id])) {
      setError("Essa pergunta é obrigatória.");
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  }
  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/satisfaction/responder/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respostas: Object.entries(answers).map(([questionId, a]) => ({ questionId, ...a })),
          comentarioAdicional: comentario || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar a resposta.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a resposta.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-3">
          <CheckCircle2 size={40} className="text-emerald-400 mx-auto" />
          <h1 className="text-white font-semibold text-lg">Resposta enviada</h1>
          <p className="text-nord-gray text-sm">Obrigado por ajudar a melhorar nosso ambiente de trabalho.</p>
        </div>
      </div>
    );
  }

  const progress = Math.round(((step + 1) / totalSteps) * 100);

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: empresa.color }} />
        <span className="text-xs text-nord-gray">{empresa.name}</span>
      </div>
      <h1 className="text-white font-semibold text-lg">{survey.title}</h1>
      {survey.description && <p className="text-nord-gray text-xs mt-1">{survey.description}</p>}

      {survey.anonima && (
        <div className="mt-3 rounded-lg border border-nord-blue/40 bg-nord-blue/10 p-3">
          <p className="text-xs text-nord-blue-light font-medium">Sua resposta é anônima</p>
          <p className="text-[11px] text-nord-gray mt-0.5">Nenhuma informação será usada para identificar você.</p>
        </div>
      )}

      <div className="flex items-center gap-2 mt-4">
        <div className="flex-1 h-1.5 rounded-full bg-nord-border overflow-hidden">
          <div className="h-full rounded-full bg-nord-blue transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[11px] text-nord-gray shrink-0">
          {step + 1}/{totalSteps}
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center py-6">
        {error && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/5 p-2.5">
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {current && (
          <div className="space-y-3">
            <p className="text-white text-base font-medium">
              {current.titulo}
              {current.obrigatoria && <span className="text-amber-400"> *</span>}
            </p>
            {current.orientacao && <p className="text-xs text-nord-gray">{current.orientacao}</p>}

            {current.tipo === "ENPS" && (
              <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
                {Array.from({ length: 11 }, (_, n) => n).map((n) => (
                  <button
                    key={n}
                    onClick={() => updateAnswer(current.id, { valorNumero: n })}
                    className={`h-9 rounded-lg text-sm font-medium ${
                      answers[current.id]?.valorNumero === n ? "bg-nord-blue text-white" : "bg-nord-panel border border-nord-border text-white"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            {current.tipo === "AVALIACAO" && (
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => updateAnswer(current.id, { valorNumero: n })}
                    className={`flex-1 h-11 rounded-lg text-sm font-medium ${
                      answers[current.id]?.valorNumero === n ? "bg-nord-blue text-white" : "bg-nord-panel border border-nord-border text-white"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            {current.tipo === "ESCOLHA_UNICA" && (
              <div className="space-y-1.5">
                {current.opcoes.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => updateAnswer(current.id, { optionId: o.id })}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm ${
                      answers[current.id]?.optionId === o.id ? "bg-nord-blue text-white" : "bg-nord-panel border border-nord-border text-white"
                    }`}
                  >
                    {o.texto}
                  </button>
                ))}
              </div>
            )}

            {current.tipo === "MULTIPLA_ESCOLHA" && (
              <div className="space-y-1.5">
                {current.opcoes.map((o) => {
                  const selected = answers[current.id]?.optionIds?.includes(o.id) ?? false;
                  return (
                    <button
                      key={o.id}
                      onClick={() => {
                        const cur = answers[current.id]?.optionIds ?? [];
                        const next = selected ? cur.filter((id) => id !== o.id) : [...cur, o.id];
                        updateAnswer(current.id, { optionIds: next });
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm ${
                        selected ? "bg-nord-blue text-white" : "bg-nord-panel border border-nord-border text-white"
                      }`}
                    >
                      {o.texto}
                    </button>
                  );
                })}
              </div>
            )}

            {current.tipo === "SIM_NAO" && (
              <div className="flex gap-2">
                <button
                  onClick={() => updateAnswer(current.id, { valorBooleano: true })}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${
                    answers[current.id]?.valorBooleano === true ? "bg-nord-blue text-white" : "bg-nord-panel border border-nord-border text-white"
                  }`}
                >
                  Sim
                </button>
                <button
                  onClick={() => updateAnswer(current.id, { valorBooleano: false })}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${
                    answers[current.id]?.valorBooleano === false ? "bg-nord-blue text-white" : "bg-nord-panel border border-nord-border text-white"
                  }`}
                >
                  Não
                </button>
              </div>
            )}

            {current.tipo === "ABERTA" && (
              <textarea
                value={answers[current.id]?.valorTexto ?? ""}
                onChange={(e) => updateAnswer(current.id, { valorTexto: e.target.value })}
                className="input min-h-28"
                placeholder="Escreva sua resposta..."
              />
            )}
          </div>
        )}

        {isCommentStep && (
          <div className="space-y-3">
            <p className="text-white text-base font-medium">Quase lá!</p>
            {survey.permitirComentarioAdicional && (
              <div>
                <p className="text-xs text-nord-gray mb-1">Algum comentário adicional? (opcional)</p>
                <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} className="input min-h-24" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pb-4">
        <button
          onClick={goBack}
          disabled={step === 0}
          className="px-4 py-3 rounded-lg text-sm border border-nord-border text-nord-gray disabled:opacity-30 flex items-center gap-1.5"
        >
          <ArrowLeft size={14} /> Voltar
        </button>
        {isCommentStep ? (
          <button
            onClick={submit}
            disabled={submitting}
            className="flex-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-3"
          >
            {submitting ? "Enviando..." : "Enviar resposta"}
          </button>
        ) : (
          <button onClick={goNext} className="flex-1 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-3">
            Próxima
          </button>
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
        .input:focus {
          border-color: var(--nord-blue);
        }
      `}</style>
    </div>
  );
}
