"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, ChevronUp, ChevronDown, Lock } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, FormError } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";
import { formatNumber } from "@/lib/calc";

type QuestionType = "NOTA_0_5" | "NOTA_0_10" | "GOSTEI_NAO_GOSTEI" | "TEXTO_LIVRE";

type PerguntaDTO = {
  id: string;
  empresaId: string | null;
  tipo: QuestionType;
  titulo: string;
  tema: string | null;
  obrigatoria: boolean;
  ordem: number;
  ativo: boolean;
  fixaNotaGeral: boolean;
};

type LoadResponse = {
  notaGeralQuestion: PerguntaDTO;
  compartilhadas: PerguntaDTO[];
  proprias: PerguntaDTO[];
  efetivas: PerguntaDTO[];
};

const TIPO_LABEL: Record<QuestionType, string> = {
  NOTA_0_5: "Nota de 0 a 5",
  NOTA_0_10: "Nota de 0 a 10",
  GOSTEI_NAO_GOSTEI: "Gostei / Não gostei",
  TEXTO_LIVRE: "Texto livre",
};

type FormState = { titulo: string; tipo: QuestionType; tema: string; obrigatoria: boolean };

function emptyForm(): FormState {
  return { titulo: "", tipo: "NOTA_0_5", tema: "", obrigatoria: true };
}

function TemaBadge({ tema }: { tema: string | null }) {
  if (!tema) return null;
  return <Badge tone="default">{tema}</Badge>;
}

export function PerguntasClient({
  canCreate,
  canEdit,
  isGrupoNordMode,
}: {
  canCreate: boolean;
  canEdit: boolean;
  isGrupoNordMode: boolean;
}) {
  const [data, setData] = useState<LoadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PerguntaDTO | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/satisfacao-cliente/perguntas");
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(json?.error ?? "Não foi possível carregar as perguntas.");
        return;
      }
      setData(json);
    } catch {
      setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega o catálogo no mount
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(p: PerguntaDTO) {
    setEditing(p);
    setForm({ titulo: p.titulo, tipo: p.tipo, tema: p.tema ?? "", obrigatoria: p.obrigatoria });
    setFormError(null);
    setModalOpen(true);
  }

  async function submit() {
    if (saving) return;
    if (!form.titulo.trim()) {
      setFormError("Informe o título da pergunta.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        titulo: form.titulo.trim(),
        tipo: form.tipo,
        tema: form.tema.trim() || null,
        obrigatoria: form.obrigatoria,
      };
      const result = editing
        ? await apiRequest(`/api/satisfacao-cliente/perguntas/${editing.id}`, "PATCH", payload)
        : await apiRequest("/api/satisfacao-cliente/perguntas", "POST", payload);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(p: PerguntaDTO) {
    setRowError(null);
    setBusyId(p.id);
    try {
      const result = await apiRequest(`/api/satisfacao-cliente/perguntas/${p.id}`, "PATCH", { ativo: !p.ativo });
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function move(list: PerguntaDTO[], p: PerguntaDTO, direction: "up" | "down") {
    const index = list.findIndex((x) => x.id === p.id);
    const swapWith = direction === "up" ? list[index - 1] : list[index + 1];
    if (!swapWith) return;
    setRowError(null);
    setBusyId(p.id);
    try {
      const [r1, r2] = await Promise.all([
        apiRequest(`/api/satisfacao-cliente/perguntas/${p.id}`, "PATCH", { ordem: swapWith.ordem }),
        apiRequest(`/api/satisfacao-cliente/perguntas/${swapWith.id}`, "PATCH", { ordem: p.ordem }),
      ]);
      if (!r1.ok) {
        setRowError(r1.error);
        return;
      }
      if (!r2.ok) {
        setRowError(r2.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const proprias = data ? [...data.proprias].sort((a, b) => a.ordem - b.ordem) : [];
  const compartilhadas = data ? [...data.compartilhadas].sort((a, b) => a.ordem - b.ordem) : [];
  const preview = data
    ? [...data.efetivas.filter((q) => !q.fixaNotaGeral && q.ativo)].sort((a, b) => a.ordem - b.ordem)
    : [];
  const totalNoFormulario = preview.length + 1; // +1 = a nota geral fixa, sempre por último

  return (
    <div className="space-y-6">
      {data && (
        <SortableStatCards
          storageKey="satisfacao-cliente-perguntas-kpi-order"
          className="grid grid-cols-2 md:grid-cols-3 gap-4"
          cards={[
            { key: "compartilhadas", label: "Compartilhadas", value: formatNumber(compartilhadas.length), icon: "Share2", color: "#9aa4b2" },
            { key: "proprias", label: "Próprias desta loja", value: formatNumber(proprias.length), icon: "Store", color: "#1464F4" },
            {
              key: "formulario",
              label: "No formulário do cliente",
              value: formatNumber(totalNoFormulario),
              icon: "ListChecks",
              color: "#22c55e",
              hint: "ativas, já contando a nota geral",
            },
          ]}
        />
      )}

      {!canCreate && !loading && !loadError && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          {isGrupoNordMode
            ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para criar ou editar perguntas."
            : "Seu perfil de permissão não permite criar ou editar perguntas de Satisfação do Cliente — você pode só visualizar esta tela."}
        </p>
      )}

      {loading ? (
        <div className="nord-card p-8 text-center text-sm text-nord-gray">Carregando...</div>
      ) : loadError ? (
        <div className="nord-card p-8 text-center text-sm text-nord-danger">{loadError}</div>
      ) : (
        data && (
          <>
            <Section title="Ordem no formulário do cliente">
              <p className="text-xs text-nord-gray mb-3">
                É assim, nesta ordem, que o cliente vê as perguntas ao escanear o QR Code de uma mesa — juntando o
                catálogo compartilhado com as perguntas próprias desta loja, sempre terminando com a nota geral.
              </p>
              {preview.length === 0 ? (
                <p className="text-sm text-nord-gray py-2">Nenhuma pergunta ativa no momento (além da nota geral).</p>
              ) : (
                <ol className="space-y-1.5">
                  {preview.map((q, i) => (
                    <li key={q.id} className="flex items-center gap-2 text-sm">
                      <span className="w-5 shrink-0 text-nord-gray text-xs">{i + 1}.</span>
                      <span className="text-white truncate">{q.titulo}</span>
                      <span className="shrink-0">
                        <Badge tone="info">{TIPO_LABEL[q.tipo]}</Badge>
                      </span>
                      <TemaBadge tema={q.tema} />
                    </li>
                  ))}
                  <li className="flex items-center gap-2 text-sm pt-1 border-t border-nord-border/60 mt-1">
                    <span className="w-5 shrink-0 text-nord-gray text-xs">{preview.length + 1}.</span>
                    <span className="text-white truncate">{data.notaGeralQuestion.titulo}</span>
                    <Badge tone="purple">Fixa</Badge>
                  </li>
                </ol>
              )}
            </Section>

            <Section title="Pergunta fixa de nota geral">
              <div className="flex items-start gap-3 rounded-lg border border-nord-border/60 bg-nord-panel/40 p-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                  <Lock size={14} className="text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium">{data.notaGeralQuestion.titulo}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <Badge tone="purple">Fixa</Badge>
                    <Badge tone="info">{TIPO_LABEL[data.notaGeralQuestion.tipo]}</Badge>
                    <Badge tone="default">Obrigatória</Badge>
                  </div>
                  <p className="text-[11px] text-nord-gray mt-2">
                    Essa pergunta existe em todas as lojas, sempre aparece por último no formulário do cliente e não
                    pode ser editada, desativada ou excluída por aqui — é assim por padrão do Portal Nord.
                  </p>
                </div>
              </div>
            </Section>

            <Section title="Perguntas compartilhadas">
              <p className="text-xs text-nord-gray mb-3">
                Catálogo padrão, usado por todas as lojas do Grupo Nord. Só pode ser alterado de forma centralizada —
                aqui você só visualiza.
              </p>
              {compartilhadas.length === 0 ? (
                <p className="text-sm text-nord-gray py-2">Nenhuma pergunta compartilhada cadastrada.</p>
              ) : (
                <div className="space-y-2">
                  {compartilhadas.map((p) => (
                    <div key={p.id} className={`rounded-lg border p-3 ${p.ativo ? "border-nord-border/60" : "border-nord-border/30 opacity-60"}`}>
                      <p className="text-sm text-white font-medium">{p.titulo}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <Badge tone="info">{TIPO_LABEL[p.tipo]}</Badge>
                        {p.obrigatoria && <Badge tone="default">Obrigatória</Badge>}
                        {!p.ativo && <Badge tone="warning">Desativada</Badge>}
                        <TemaBadge tema={p.tema} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section
              title="Perguntas desta loja"
              action={
                canCreate && (
                  <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
                    <Plus size={13} /> Nova pergunta
                  </button>
                )
              }
            >
              <FormError message={rowError} />
              {proprias.length === 0 ? (
                <p className="text-sm text-nord-gray py-2">
                  Nenhuma pergunta própria cadastrada ainda. Você pode criar perguntas extras, além das
                  compartilhadas, só para esta loja.
                </p>
              ) : (
                <div className="space-y-2">
                  {proprias.map((p, index) => (
                    <div
                      key={p.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${p.ativo ? "border-nord-border/60" : "border-nord-border/30 opacity-60"}`}
                    >
                      {canEdit && (
                        <div className="flex flex-col gap-0.5 pt-0.5 shrink-0">
                          <button
                            onClick={() => move(proprias, p, "up")}
                            disabled={busyId !== null || index === 0}
                            title="Mover para cima"
                            className="text-nord-gray hover:text-white disabled:opacity-20 disabled:hover:text-nord-gray"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            onClick={() => move(proprias, p, "down")}
                            disabled={busyId !== null || index === proprias.length - 1}
                            title="Mover para baixo"
                            className="text-nord-gray hover:text-white disabled:opacity-20 disabled:hover:text-nord-gray"
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white font-medium">{p.titulo}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <Badge tone="info">{TIPO_LABEL[p.tipo]}</Badge>
                          {p.obrigatoria && <Badge tone="default">Obrigatória</Badge>}
                          {!p.ativo && <Badge tone="warning">Desativada</Badge>}
                          <TemaBadge tema={p.tema} />
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => openEdit(p)} className="text-nord-gray hover:text-white flex items-center gap-1 text-xs">
                            <Pencil size={12} /> Editar
                          </button>
                          <button
                            onClick={() => toggleAtivo(p)}
                            disabled={busyId === p.id}
                            className="text-nord-gray hover:text-white text-xs disabled:opacity-50"
                          >
                            {p.ativo ? "Desativar" : "Ativar"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar pergunta" : "Nova pergunta"}>
        <FormError message={formError} />
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Título da pergunta</span>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className="input"
              placeholder="Ex.: O atendimento foi rápido?"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Tipo de resposta</span>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as QuestionType })} className="input">
                {Object.entries(TIPO_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Tema (opcional)</span>
              <input
                type="text"
                value={form.tema}
                onChange={(e) => setForm({ ...form, tema: e.target.value })}
                className="input"
                placeholder="atendimento, comida..."
              />
            </label>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.obrigatoria} onChange={(e) => setForm({ ...form, obrigatoria: e.target.checked })} />
            <span className="text-sm text-white">Obrigatória (o cliente precisa responder para continuar)</span>
          </label>

          <p className="text-[11px] text-nord-gray">
            O tema agrupa perguntas parecidas (ex.: &quot;atendimento&quot;, &quot;comida&quot;, &quot;tempo_espera&quot;,
            &quot;ambiente&quot;, &quot;limpeza&quot;) para relatórios futuros — é um texto livre, use sempre a mesma
            palavra para juntar perguntas do mesmo assunto.
          </p>

          <button
            onClick={submit}
            disabled={saving}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar pergunta"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
