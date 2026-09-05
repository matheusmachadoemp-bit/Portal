"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Copy, ChevronUp, ChevronDown } from "lucide-react";
import { SATISFACTION_QUESTION_TYPE_LABEL, SATISFACTION_THEME_LABEL } from "@/lib/satisfaction";

type Question = {
  id?: string;
  tipo: string;
  tema: string | null;
  titulo: string;
  orientacao: string;
  obrigatoria: boolean;
  opcoes: { texto: string }[];
};

type AudienceEntry = { empresaId: string; setor: string | null };

const OPTION_TYPES = new Set(["ESCOLHA_UNICA", "MULTIPLA_ESCOLHA"]);

function todaySP() {
  const d = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function emptyQuestion(): Question {
  return { tipo: "AVALIACAO", tema: null, titulo: "", orientacao: "", obrigatoria: true, opcoes: [] };
}

export function CriarPesquisaClient({
  empresas,
  employeeCounts,
  setores,
  initialSurvey,
}: {
  empresas: { id: string; name: string }[];
  employeeCounts: { empresaId: string; setorLabel: string; count: number }[];
  setores: { key: string; label: string }[];
  initialSurvey: {
    id: string;
    title: string;
    description: string | null;
    startDate: string;
    endDate: string;
    anonima: boolean;
    permitirApenasUmaResposta: boolean;
    exibirResultadoColaborador: boolean;
    permitirComentarioAdicional: boolean;
    embaralharPerguntas: boolean;
    publico: AudienceEntry[];
    perguntas: { id: string; tipo: string; tema: string | null; titulo: string; orientacao: string | null; obrigatoria: boolean; opcoes: { texto: string }[] }[];
  } | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initialSurvey?.title ?? "");
  const [description, setDescription] = useState(initialSurvey?.description ?? "");
  const [startDate, setStartDate] = useState(initialSurvey?.startDate.slice(0, 10) ?? todaySP());
  const [endDate, setEndDate] = useState(initialSurvey?.endDate.slice(0, 10) ?? "");
  const [anonima, setAnonima] = useState(initialSurvey?.anonima ?? true);
  const [permitirApenasUmaResposta, setPermitirApenasUmaResposta] = useState(initialSurvey?.permitirApenasUmaResposta ?? true);
  const [exibirResultadoColaborador, setExibirResultadoColaborador] = useState(initialSurvey?.exibirResultadoColaborador ?? false);
  const [permitirComentarioAdicional, setPermitirComentarioAdicional] = useState(initialSurvey?.permitirComentarioAdicional ?? true);
  const [embaralharPerguntas, setEmbaralharPerguntas] = useState(initialSurvey?.embaralharPerguntas ?? false);
  const [publico, setPublico] = useState<AudienceEntry[]>(initialSurvey?.publico.map((p) => ({ empresaId: p.empresaId, setor: p.setor })) ?? []);
  const [perguntas, setPerguntas] = useState<Question[]>(
    initialSurvey?.perguntas.map((q) => ({ ...q, orientacao: q.orientacao ?? "" })) ?? []
  );

  const isWholeStore = (empresaId: string) => publico.some((p) => p.empresaId === empresaId && p.setor === null);
  const isSetorSelected = (empresaId: string, setor: string) => publico.some((p) => p.empresaId === empresaId && p.setor === setor);

  function toggleWholeStore(empresaId: string) {
    setPublico((prev) => {
      const already = prev.some((p) => p.empresaId === empresaId && p.setor === null);
      const withoutEmpresa = prev.filter((p) => p.empresaId !== empresaId);
      return already ? withoutEmpresa : [...withoutEmpresa, { empresaId, setor: null }];
    });
  }
  function toggleSetor(empresaId: string, setor: string) {
    setPublico((prev) => {
      const withoutWhole = prev.filter((p) => !(p.empresaId === empresaId && p.setor === null));
      const already = withoutWhole.some((p) => p.empresaId === empresaId && p.setor === setor);
      return already
        ? withoutWhole.filter((p) => !(p.empresaId === empresaId && p.setor === setor))
        : [...withoutWhole, { empresaId, setor }];
    });
  }

  const totalColaboradores = useMemo(() => {
    let total = 0;
    for (const p of publico) {
      if (p.setor === null) {
        total += employeeCounts.filter((c) => c.empresaId === p.empresaId).reduce((s, c) => s + c.count, 0);
      } else {
        total += employeeCounts.find((c) => c.empresaId === p.empresaId && c.setorLabel === p.setor)?.count ?? 0;
      }
    }
    return total;
  }, [publico, employeeCounts]);

  function addQuestion() {
    setPerguntas((p) => [...p, emptyQuestion()]);
  }
  function updateQuestion(idx: number, patch: Partial<Question>) {
    setPerguntas((p) => p.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }
  function removeQuestion(idx: number) {
    setPerguntas((p) => p.filter((_, i) => i !== idx));
  }
  function duplicateQuestion(idx: number) {
    setPerguntas((p) => {
      const copy = { ...p[idx], id: undefined, opcoes: p[idx].opcoes.map((o) => ({ ...o })) };
      const next = [...p];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }
  function moveQuestion(idx: number, dir: -1 | 1) {
    setPerguntas((p) => {
      const next = [...p];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return p;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }
  function addOption(qIdx: number) {
    updateQuestion(qIdx, { opcoes: [...perguntas[qIdx].opcoes, { texto: "" }] });
  }
  function updateOption(qIdx: number, oIdx: number, texto: string) {
    const opcoes = perguntas[qIdx].opcoes.map((o, i) => (i === oIdx ? { texto } : o));
    updateQuestion(qIdx, { opcoes });
  }
  function removeOption(qIdx: number, oIdx: number) {
    updateQuestion(qIdx, { opcoes: perguntas[qIdx].opcoes.filter((_, i) => i !== oIdx) });
  }

  async function submit(publish: boolean) {
    setError(null);
    if (!title.trim()) return setError("Informe o título da pesquisa.");
    if (!endDate) return setError("Informe a data de encerramento.");
    if (publico.length === 0) return setError("Selecione pelo menos uma loja para o público da pesquisa.");
    if (perguntas.length === 0) return setError("Adicione pelo menos uma pergunta.");
    for (const q of perguntas) {
      if (!q.titulo.trim()) return setError("Todas as perguntas precisam de um título.");
      if (OPTION_TYPES.has(q.tipo) && q.opcoes.filter((o) => o.texto.trim()).length < 2) {
        return setError(`A pergunta "${q.titulo}" precisa de pelo menos 2 opções.`);
      }
    }

    setSaving(true);
    const payload = {
      title,
      description,
      startDate: new Date(`${startDate}T00:00:00-03:00`).toISOString(),
      endDate: new Date(`${endDate}T23:59:59-03:00`).toISOString(),
      anonima,
      permitirApenasUmaResposta,
      exibirResultadoColaborador,
      permitirComentarioAdicional,
      embaralharPerguntas,
      publish,
      publico,
      perguntas: perguntas.map((q) => ({ ...q, opcoes: q.opcoes.filter((o) => o.texto.trim()) })),
    };
    try {
      const res = await fetch(initialSurvey ? `/api/satisfaction/surveys/${initialSurvey.id}` : "/api/satisfaction/surveys", {
        method: initialSurvey ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar a pesquisa.");
      router.push("/portal/rh/pesquisa-satisfacao");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a pesquisa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {error && (
        <div className="nord-card p-3 border-red-500/40 bg-red-500/5">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      <div className="nord-card p-4 space-y-3">
        <p className="text-xs text-nord-gray font-medium">Informações da pesquisa</p>
        <Field label="Título">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
        </Field>
        <Field label="Descrição">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-16" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data de início">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
          </Field>
          <Field label="Data de encerramento">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
          </Field>
        </div>
      </div>

      <div className="nord-card p-4 space-y-3">
        <p className="text-xs text-nord-gray font-medium">Público da pesquisa</p>
        {empresas.map((emp) => (
          <div key={emp.id} className="border border-nord-border/60 rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm text-white font-medium">
              <input type="checkbox" checked={isWholeStore(emp.id)} onChange={() => toggleWholeStore(emp.id)} />
              {emp.name} — loja inteira
            </label>
            <div className="flex flex-wrap gap-2 pl-6">
              {setores.map((s) => {
                const count = employeeCounts.find((c) => c.empresaId === emp.id && c.setorLabel === s.label)?.count ?? 0;
                return (
                  <label
                    key={s.key}
                    className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer border flex items-center gap-1.5 ${
                      isWholeStore(emp.id) || isSetorSelected(emp.id, s.label)
                        ? "bg-nord-blue border-nord-blue text-white"
                        : "border-nord-border text-nord-gray"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      disabled={isWholeStore(emp.id)}
                      checked={isWholeStore(emp.id) || isSetorSelected(emp.id, s.label)}
                      onChange={() => toggleSetor(emp.id, s.label)}
                    />
                    {s.label} ({count})
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <p className="text-xs text-nord-gray">{totalColaboradores} colaborador(es) selecionado(s).</p>
      </div>

      <div className="nord-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-nord-gray font-medium">Perguntas</p>
          <button onClick={addQuestion} className="text-xs text-nord-blue-light hover:underline flex items-center gap-1">
            <Plus size={12} /> Adicionar pergunta
          </button>
        </div>
        <div className="space-y-3">
          {perguntas.map((q, idx) => (
            <div key={idx} className="rounded-lg border border-nord-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={q.titulo}
                  onChange={(e) => updateQuestion(idx, { titulo: e.target.value })}
                  placeholder="Título da pergunta"
                  className="input flex-1"
                />
                <select value={q.tipo} onChange={(e) => updateQuestion(idx, { tipo: e.target.value })} className="input w-auto">
                  {Object.entries(SATISFACTION_QUESTION_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={q.orientacao}
                onChange={(e) => updateQuestion(idx, { orientacao: e.target.value })}
                placeholder="Orientação (opcional)"
                className="input"
              />
              {OPTION_TYPES.has(q.tipo) && (
                <div className="space-y-1.5 pl-2 border-l-2 border-nord-border/60">
                  {q.opcoes.map((o, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-2">
                      <input
                        value={o.texto}
                        onChange={(e) => updateOption(idx, oIdx, e.target.value)}
                        placeholder={`Opção ${oIdx + 1}`}
                        className="input flex-1"
                      />
                      <button onClick={() => removeOption(idx, oIdx)} className="text-nord-gray hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addOption(idx)} className="text-xs text-nord-blue-light hover:underline">
                    + Adicionar opção
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-nord-gray">
                    <input
                      type="checkbox"
                      checked={q.obrigatoria}
                      onChange={(e) => updateQuestion(idx, { obrigatoria: e.target.checked })}
                    />
                    Obrigatória
                  </label>
                  <select
                    value={q.tema ?? ""}
                    onChange={(e) => updateQuestion(idx, { tema: e.target.value || null })}
                    className="input w-auto text-xs"
                  >
                    <option value="">Sem tema</option>
                    {Object.entries(SATISFACTION_THEME_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => moveQuestion(idx, -1)} className="text-nord-gray hover:text-white" title="Mover para cima">
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={() => moveQuestion(idx, 1)} className="text-nord-gray hover:text-white" title="Mover para baixo">
                    <ChevronDown size={14} />
                  </button>
                  <button onClick={() => duplicateQuestion(idx)} className="text-nord-gray hover:text-white" title="Duplicar">
                    <Copy size={13} />
                  </button>
                  <button onClick={() => removeQuestion(idx)} className="text-nord-gray hover:text-red-400" title="Excluir">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {perguntas.length === 0 && <p className="text-xs text-nord-gray text-center py-3">Nenhuma pergunta adicionada ainda.</p>}
        </div>
      </div>

      <div className="nord-card p-4 space-y-2">
        <p className="text-xs text-nord-gray font-medium mb-1">Configurações</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={anonima} onChange={(e) => setAnonima(e.target.checked)} />
          <span className="text-sm text-white">Pesquisa anônima</span>
        </label>
        {anonima && (
          <p className="text-[11px] text-nord-gray pl-6">A identidade do colaborador não será registrada nem exibida nos resultados.</p>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={permitirApenasUmaResposta}
            onChange={(e) => setPermitirApenasUmaResposta(e.target.checked)}
          />
          <span className="text-sm text-white">Permitir somente uma resposta</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={exibirResultadoColaborador}
            onChange={(e) => setExibirResultadoColaborador(e.target.checked)}
          />
          <span className="text-sm text-white">Exibir resultado ao colaborador</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={permitirComentarioAdicional}
            onChange={(e) => setPermitirComentarioAdicional(e.target.checked)}
          />
          <span className="text-sm text-white">Permitir comentário adicional</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={embaralharPerguntas} onChange={(e) => setEmbaralharPerguntas(e.target.checked)} />
          <span className="text-sm text-white">Embaralhar perguntas</span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => submit(false)}
          disabled={saving}
          className="flex-1 bg-nord-panel border border-nord-border text-white text-sm font-medium rounded-lg py-2.5 disabled:opacity-50"
        >
          Salvar rascunho
        </button>
        <button
          onClick={() => submit(true)}
          disabled={saving}
          className="flex-1 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5 disabled:opacity-50"
        >
          Publicar pesquisa
        </button>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-nord-gray mb-1">{label}</span>
      {children}
    </label>
  );
}
