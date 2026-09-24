"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, PartyPopper, ThumbsDown, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/stat-card";

type QuestionType = "NOTA_0_5" | "NOTA_0_10" | "GOSTEI_NAO_GOSTEI" | "TEXTO_LIVRE";
type Question = { id: string; tipo: QuestionType; titulo: string; tema: string | null; obrigatoria: boolean };
type Garcom = { id: string; name: string };
type Answer = { valorNota?: number; valorGostei?: boolean; valorTexto?: string };

type Step = { kind: "identificacao" } | { kind: "pergunta"; question: Question } | { kind: "nota-geral" } | { kind: "sugestao" };

// Formatação só visual (o backend recebe/valida os dígitos, nunca essa string formatada) — mesmo
// racional de `onlyDigits` em customer-survey-server.ts, mas reimplementada aqui: esse arquivo é
// "use client" e nunca pode importar de customer-survey-server.ts (puxaria o Prisma Client pro
// bundle do navegador).
function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatTelefone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function prettyTema(tema: string): string {
  const spaced = tema.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : spaced;
}

function notaColor(n: number, max: number): string {
  const ratio = n / max;
  if (ratio < 0.34) return "#ef4444"; // --nord-danger
  if (ratio < 0.67) return "#f59e0b"; // --nord-warning
  return "#22c55e"; // --nord-success
}

const EMOJIS = ["😡", "🙁", "😕", "😐", "🙂", "😄"];
function notaEmoji(n: number, max: number): string {
  const idx = Math.round((n / max) * (EMOJIS.length - 1));
  return EMOJIS[idx];
}

/** Escala de nota (0-5 ou 0-10) com emoji e cor conforme o valor — usada tanto pelas perguntas
 *  regulares do tipo NOTA_0_5/NOTA_0_10 quanto pela pergunta fixa de nota geral (0-10). */
function NotaScale({ max, value, onChange }: { max: number; value: number | null; onChange: (n: number) => void }) {
  const options = Array.from({ length: max + 1 }, (_, n) => n);

  if (max <= 5) {
    return (
      <div className="grid grid-cols-6 gap-1.5">
        {options.map((n) => {
          const selected = value === n;
          const color = notaColor(n, max);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl py-2.5 border transition text-nord-gray bg-nord-panel border-nord-border hover:border-white/30"
              style={selected ? { backgroundColor: color, borderColor: color, color: "white" } : undefined}
            >
              <span className="text-xl leading-none">{notaEmoji(n, max)}</span>
              <span className="text-[11px] font-medium">{n}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-1">
        <span className="text-4xl leading-none">{value === null ? "🤔" : notaEmoji(value, max)}</span>
        <span className="text-nord-gray text-xs">{value === null ? "Toque em uma nota abaixo" : `Sua nota: ${value}`}</span>
      </div>
      <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
        {options.map((n) => {
          const selected = value === n;
          const color = notaColor(n, max);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="h-11 rounded-lg text-sm font-semibold border transition text-white bg-nord-panel border-nord-border hover:border-white/30"
              style={selected ? { backgroundColor: color, borderColor: color } : undefined}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GostouWidget({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`flex-1 flex flex-col items-center gap-1.5 py-5 rounded-2xl border transition ${
          value === true ? "bg-nord-success/15 border-nord-success text-nord-success" : "bg-nord-panel border-nord-border text-nord-gray hover:border-white/30"
        }`}
      >
        <ThumbsUp size={28} />
        <span className="text-sm font-medium">Gostei</span>
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`flex-1 flex flex-col items-center gap-1.5 py-5 rounded-2xl border transition ${
          value === false ? "bg-nord-danger/15 border-nord-danger text-nord-danger" : "bg-nord-panel border-nord-border text-nord-gray hover:border-white/30"
        }`}
      >
        <ThumbsDown size={28} />
        <span className="text-sm font-medium">Não gostei</span>
      </button>
    </div>
  );
}

function isQuestionAnswered(question: Question, answer: Answer | undefined): boolean {
  if (!answer) return false;
  if (question.tipo === "NOTA_0_5" || question.tipo === "NOTA_0_10") return answer.valorNota !== undefined;
  if (question.tipo === "GOSTEI_NAO_GOSTEI") return answer.valorGostei !== undefined;
  return !!answer.valorTexto && answer.valorTexto.trim() !== "";
}

const todayStr = new Date().toISOString().slice(0, 10);

export function AvaliarClient({
  token,
  empresa,
  mesaNumero,
  notaGeral,
  perguntas,
  garcons,
}: {
  token: string;
  empresa: { name: string; color: string; logo: string | null };
  mesaNumero: string;
  notaGeral: Question;
  perguntas: Question[];
  garcons: Garcom[];
}) {
  const steps: Step[] = useMemo(
    () => [{ kind: "identificacao" }, ...perguntas.map((q) => ({ kind: "pergunta" as const, question: q })), { kind: "nota-geral" }, { kind: "sugestao" }],
    [perguntas]
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [garcomId, setGarcomId] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [notaGeralValor, setNotaGeralValor] = useState<number | null>(null);
  const [sugestao, setSugestao] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const step = steps[stepIndex];

  function updateAnswer(questionId: string, patch: Partial<Answer>) {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], ...patch } }));
    setError(null);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/satisfacao-cliente/responder/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          telefone: onlyDigits(telefone),
          dataNascimento: dataNascimento || undefined,
          garcomIndicadoId: garcomId || undefined,
          notaGeral: notaGeralValor,
          respostas: Object.entries(answers).map(([questionId, a]) => ({ questionId, ...a })),
          sugestao: sugestao.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar sua avaliação. Tente novamente.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar sua avaliação. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    setError(null);
    if (step.kind === "identificacao") {
      if (!nome.trim()) {
        setError("Informe seu nome.");
        return;
      }
      if (onlyDigits(telefone).length < 8) {
        setError("Informe um telefone válido.");
        return;
      }
    }
    if (step.kind === "pergunta" && step.question.obrigatoria && !isQuestionAnswered(step.question, answers[step.question.id])) {
      setError("Essa pergunta é obrigatória.");
      return;
    }
    if (step.kind === "nota-geral" && notaGeralValor === null) {
      setError("Dê uma nota de 0 a 10 para sua experiência.");
      return;
    }
    if (stepIndex === steps.length - 1) {
      submit();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  if (done) {
    const primeiroNome = nome.trim().split(" ")[0];
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-3">
          <PartyPopper size={40} className="text-nord-success mx-auto" />
          <h1 className="text-white font-semibold text-lg">{primeiroNome ? `Obrigado, ${primeiroNome}!` : "Obrigado!"}</h1>
          <p className="text-nord-gray text-sm">
            Sua avaliação foi enviada com sucesso. Ela é muito importante pra {empresa.name} continuar melhorando.
          </p>
        </div>
      </div>
    );
  }

  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col p-5">
      {/* `<h1>` (não `<div>`/`<span>`) de propósito: é o único texto fixo visível durante TODO o
          fluxo interativo (identificação, cada pergunta, nota geral, sugestão) — sem um heading
          de nível 1 aqui, leitor de tela não tem nenhum atalho de navegação por heading enquanto o
          cliente passa a maior parte do tempo na página (achado do Teulis). Visualmente continua
          pequeno/discreto (`text-xs text-nord-gray font-normal`) — só a tag semântica muda. */}
      <h1 className="flex items-center gap-2 mb-1 text-xs text-nord-gray font-normal">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: empresa.color }} />
        <span className="truncate">{empresa.name}</span>
        <span>·</span>
        <span className="shrink-0">Mesa {mesaNumero}</span>
      </h1>

      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1 h-1.5 rounded-full bg-nord-border overflow-hidden">
          <div className="h-full rounded-full bg-nord-blue transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[11px] text-nord-gray shrink-0">
          {stepIndex + 1}/{steps.length}
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center py-6">
        {error && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/5 p-2.5">
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {step.kind === "identificacao" && (
          <div className="space-y-4">
            <div className="text-center mb-1">
              <p className="text-white text-lg font-semibold">Como foi sua experiência hoje?</p>
              <p className="text-nord-gray text-xs mt-1">Leva menos de 1 minuto — antes, só precisamos te conhecer</p>
            </div>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Seu nome</span>
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="input" placeholder="Como podemos te chamar?" autoFocus />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">WhatsApp ou celular</span>
              <input
                type="tel"
                inputMode="numeric"
                value={telefone}
                onChange={(e) => setTelefone(formatTelefone(e.target.value))}
                className="input"
                placeholder="(00) 00000-0000"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Data de nascimento (opcional)</span>
              <input type="date" value={dataNascimento} max={todayStr} onChange={(e) => setDataNascimento(e.target.value)} className="input" />
            </label>
            {garcons.length > 0 && (
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Quem te atendeu? (opcional)</span>
                <select value={garcomId} onChange={(e) => setGarcomId(e.target.value)} className="input">
                  <option value="">Prefiro não informar</option>
                  {garcons.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {step.kind === "pergunta" && (
          <div className="space-y-4">
            {step.question.tema && (
              <p className="text-center">
                <Badge tone="info">{prettyTema(step.question.tema)}</Badge>
              </p>
            )}
            <p className="text-white text-lg font-semibold text-center">
              {step.question.titulo}
              {step.question.obrigatoria && <span className="text-amber-400"> *</span>}
            </p>

            {(step.question.tipo === "NOTA_0_5" || step.question.tipo === "NOTA_0_10") && (
              <NotaScale
                max={step.question.tipo === "NOTA_0_5" ? 5 : 10}
                value={answers[step.question.id]?.valorNota ?? null}
                onChange={(n) => updateAnswer(step.question.id, { valorNota: n })}
              />
            )}

            {step.question.tipo === "GOSTEI_NAO_GOSTEI" && (
              <div className="space-y-3">
                <GostouWidget
                  value={answers[step.question.id]?.valorGostei}
                  onChange={(v) =>
                    // Quando o cliente muda de ideia e marca "Gostei" depois de já ter digitado uma
                    // reclamação em "Não gostei", o campo de texto some da tela (achado do Teulis)
                    // mas sem isso o valor continuava no estado e ia junto pro banco — uma resposta
                    // "gostei" gravada silenciosamente com o texto negativo grudado. `valorTexto:
                    // undefined` some do JSON enviado (JSON.stringify omite chaves `undefined`), e o
                    // backend já trata a ausência do campo como "sem texto" (extractAnswerData).
                    updateAnswer(step.question.id, v ? { valorGostei: true, valorTexto: undefined } : { valorGostei: false })
                  }
                />
                {answers[step.question.id]?.valorGostei === false && (
                  <textarea
                    value={answers[step.question.id]?.valorTexto ?? ""}
                    onChange={(e) => updateAnswer(step.question.id, { valorTexto: e.target.value })}
                    className="input min-h-24"
                    placeholder="O que não te agradou? (opcional)"
                  />
                )}
              </div>
            )}

            {step.question.tipo === "TEXTO_LIVRE" && (
              <textarea
                value={answers[step.question.id]?.valorTexto ?? ""}
                onChange={(e) => updateAnswer(step.question.id, { valorTexto: e.target.value })}
                className="input min-h-28"
                placeholder="Escreva sua resposta..."
                autoFocus
              />
            )}
          </div>
        )}

        {step.kind === "nota-geral" && (
          <div className="space-y-4">
            <p className="text-white text-lg font-semibold text-center">
              {notaGeral.titulo}
              <span className="text-amber-400"> *</span>
            </p>
            <p className="text-nord-gray text-xs text-center">A nota que mais importa pra gente — sobre sua experiência de hoje, no geral.</p>
            <NotaScale max={10} value={notaGeralValor} onChange={setNotaGeralValor} />
          </div>
        )}

        {step.kind === "sugestao" && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-white text-lg font-semibold">Quer deixar alguma sugestão?</p>
              <p className="text-nord-gray text-xs mt-1">Opcional — conte pra gente o que podemos melhorar.</p>
            </div>
            <textarea value={sugestao} onChange={(e) => setSugestao(e.target.value)} className="input min-h-28" placeholder="Escreva aqui (opcional)..." />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pb-4">
        <button
          onClick={goBack}
          disabled={stepIndex === 0}
          className="px-4 py-3 rounded-lg text-sm border border-nord-border text-nord-gray disabled:opacity-30 flex items-center gap-1.5"
        >
          <ArrowLeft size={14} /> Voltar
        </button>
        <button
          onClick={goNext}
          disabled={submitting}
          className="flex-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-3"
        >
          {stepIndex === steps.length - 1 ? (submitting ? "Enviando..." : "Enviar avaliação") : "Continuar"}
        </button>
      </div>
    </div>
  );
}
