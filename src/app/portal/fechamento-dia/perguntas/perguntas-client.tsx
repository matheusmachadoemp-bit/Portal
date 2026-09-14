"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import type { FechamentoTipoResposta, FechamentoGravidade } from "@prisma/client";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { GRAVIDADE_OPTIONS } from "../ocorrencias/constants";

type Opcao = { id: string; texto: string; ordem: number };

type PerguntaDTO = {
  id: string;
  texto: string;
  orientacao: string | null;
  tipo: FechamentoTipoResposta;
  obrigatoria: boolean;
  ordem: number;
  ativa: boolean;
  abreOcorrencia: boolean;
  perguntaPaiId: string | null;
  valorPaiQueExibe: string | null;
  categoriaSugeridaId: string | null;
  gravidadeSugerida: FechamentoGravidade | null;
  opcoes: Opcao[];
  cargoIds: string[];
  _count: { respostas: number; condicionais: number };
};

type Cargo = { id: string; nome: string };
type Categoria = { id: string; nome: string };

const TIPO_LABEL: Record<FechamentoTipoResposta, string> = {
  SIM_NAO: "Sim/Não",
  TEXTO: "Texto livre",
  MULTIPLA_ESCOLHA: "Múltipla escolha",
  NOTA_1_5: "Nota de 1 a 5",
  NUMERO: "Número",
  PRODUTO: "Produto (Ficha Técnica)",
  COLABORADOR: "Colaborador",
  FOTO: "Foto",
  ANEXO: "Anexo",
};

const TIPOS_COM_OPCOES: FechamentoTipoResposta[] = ["MULTIPLA_ESCOLHA"];
const TIPOS_CONDICIONAVEIS: FechamentoTipoResposta[] = ["SIM_NAO", "MULTIPLA_ESCOLHA"];

type FormState = {
  texto: string;
  orientacao: string;
  tipo: FechamentoTipoResposta;
  obrigatoria: boolean;
  ativa: boolean;
  abreOcorrencia: boolean;
  perguntaPaiId: string;
  valorPaiQueExibe: string;
  categoriaSugeridaId: string;
  gravidadeSugerida: FechamentoGravidade | "";
  cargoIds: string[];
  opcoes: { id?: string; texto: string }[];
};

function emptyForm(): FormState {
  return {
    texto: "",
    orientacao: "",
    tipo: "TEXTO",
    obrigatoria: true,
    ativa: true,
    abreOcorrencia: false,
    perguntaPaiId: "",
    valorPaiQueExibe: "",
    categoriaSugeridaId: "",
    gravidadeSugerida: "",
    cargoIds: [],
    opcoes: [],
  };
}

function formFromPergunta(p: PerguntaDTO): FormState {
  return {
    texto: p.texto,
    orientacao: p.orientacao ?? "",
    tipo: p.tipo,
    obrigatoria: p.obrigatoria,
    ativa: p.ativa,
    abreOcorrencia: p.abreOcorrencia,
    perguntaPaiId: p.perguntaPaiId ?? "",
    valorPaiQueExibe: p.valorPaiQueExibe ?? "",
    categoriaSugeridaId: p.categoriaSugeridaId ?? "",
    gravidadeSugerida: p.gravidadeSugerida ?? "",
    cargoIds: p.cargoIds,
    opcoes: p.opcoes.map((o) => ({ id: o.id, texto: o.texto })),
  };
}

export function PerguntasClient({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  const [perguntas, setPerguntas] = useState<PerguntaDTO[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<PerguntaDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [filtroCargoId, setFiltroCargoId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/fechamento-dia/perguntas");
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data?.error ?? "Não foi possível carregar as perguntas.");
        return;
      }
      setPerguntas(data.perguntas);
      setCargos(data.cargos);
      setCategorias(data.categorias);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega o catálogo no mount
    load();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(p: PerguntaDTO) {
    setEditingId(p.id);
    setForm(formFromPergunta(p));
    setFormError(null);
    setModalOpen(true);
  }

  function updateForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function toggleCargo(cargoId: string) {
    setForm((prev) => ({
      ...prev,
      cargoIds: prev.cargoIds.includes(cargoId) ? prev.cargoIds.filter((c) => c !== cargoId) : [...prev.cargoIds, cargoId],
    }));
  }

  function updateOpcao(idx: number, texto: string) {
    setForm((prev) => ({ ...prev, opcoes: prev.opcoes.map((o, i) => (i === idx ? { ...o, texto } : o)) }));
  }

  function addOpcao() {
    setForm((prev) => ({ ...prev, opcoes: [...prev.opcoes, { texto: "" }] }));
  }

  function removeOpcao(idx: number) {
    setForm((prev) => ({ ...prev, opcoes: prev.opcoes.filter((_, i) => i !== idx) }));
  }

  const perguntaPai = perguntas.find((p) => p.id === form.perguntaPaiId);

  const perguntasFiltradas = filtroCargoId ? perguntas.filter((p) => p.cargoIds.includes(filtroCargoId)) : perguntas;

  async function submit() {
    if (saving) return;
    setFormError(null);
    if (!form.texto.trim()) {
      setFormError("Informe o texto da pergunta.");
      return;
    }
    if (TIPOS_COM_OPCOES.includes(form.tipo) && form.opcoes.filter((o) => o.texto.trim()).length < 2) {
      setFormError("Perguntas de múltipla escolha precisam de pelo menos 2 opções.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        texto: form.texto.trim(),
        orientacao: form.orientacao.trim() || null,
        tipo: form.tipo,
        obrigatoria: form.obrigatoria,
        ativa: form.ativa,
        abreOcorrencia: form.abreOcorrencia,
        perguntaPaiId: form.perguntaPaiId || null,
        valorPaiQueExibe: form.perguntaPaiId ? form.valorPaiQueExibe || null : null,
        categoriaSugeridaId: form.abreOcorrencia ? form.categoriaSugeridaId || null : null,
        gravidadeSugerida: form.abreOcorrencia ? form.gravidadeSugerida || null : null,
        cargoIds: form.cargoIds,
        opcoes: TIPOS_COM_OPCOES.includes(form.tipo) ? form.opcoes.filter((o) => o.texto.trim()) : [],
      };
      const res = await fetch(editingId ? `/api/fechamento-dia/perguntas/${editingId}` : "/api/fechamento-dia/perguntas", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data?.error ?? "Não foi possível salvar a pergunta.");
        return;
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/fechamento-dia/perguntas/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setDeleteError(data?.error ?? "Não foi possível excluir essa pergunta.");
        return;
      }
      setDeleteTarget(null);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Section
        title="Catálogo de perguntas"
        action={
          canEdit && (
            <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
              <Plus size={13} /> Nova pergunta
            </button>
          )
        }
      >
        {!loading && !loadError && perguntas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button
              onClick={() => setFiltroCargoId(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                filtroCargoId === null ? "bg-nord-blue border-nord-blue text-white" : "bg-nord-panel border-nord-border text-nord-gray hover:text-white"
              }`}
            >
              Todos ({perguntas.length})
            </button>
            {cargos.map((c) => {
              const count = perguntas.filter((p) => p.cargoIds.includes(c.id)).length;
              return (
                <button
                  key={c.id}
                  onClick={() => setFiltroCargoId(c.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    filtroCargoId === c.id ? "bg-nord-blue border-nord-blue text-white" : "bg-nord-panel border-nord-border text-nord-gray hover:text-white"
                  }`}
                >
                  {c.nome} ({count})
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-nord-gray text-center py-8">Carregando...</p>
        ) : loadError ? (
          <p className="text-sm text-red-400 text-center py-8">{loadError}</p>
        ) : perguntas.length === 0 ? (
          <p className="text-sm text-nord-gray text-center py-8">Nenhuma pergunta cadastrada ainda.</p>
        ) : perguntasFiltradas.length === 0 ? (
          <p className="text-sm text-nord-gray text-center py-8">Nenhuma pergunta para esse cargo.</p>
        ) : (
          <div className="space-y-2">
            {perguntasFiltradas.map((p) => (
              <div
                key={p.id}
                className={`rounded-lg border p-3 ${p.ativa ? "border-nord-border/60" : "border-nord-border/30 opacity-60"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium">{p.texto}</p>
                    {p.orientacao && <p className="text-xs text-nord-gray mt-0.5">{p.orientacao}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge tone="info">{TIPO_LABEL[p.tipo]}</Badge>
                      {p.obrigatoria && <Badge tone="default">Obrigatória</Badge>}
                      {!p.ativa && <Badge tone="warning">Desativada</Badge>}
                      {p.abreOcorrencia && <Badge tone="warning">Abre ocorrência</Badge>}
                      {p.cargoIds.map((cid) => {
                        const cargo = cargos.find((c) => c.id === cid);
                        return cargo ? (
                          <Badge key={cid} tone="default">
                            {cargo.nome}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                    {p.perguntaPaiId && (
                      <p className="text-[11px] text-nord-gray mt-1.5">
                        Depende de: &quot;{perguntas.find((x) => x.id === p.perguntaPaiId)?.texto ?? "-"}&quot; = {p.valorPaiQueExibe}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => openEdit(p)} className="text-nord-gray hover:text-white flex items-center gap-1 text-xs">
                        <Pencil size={12} /> Editar
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget(p)}
                          className="text-nord-gray hover:text-red-400 flex items-center gap-1 text-xs"
                        >
                          <Trash2 size={12} /> Excluir
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Editar pergunta" : "Nova pergunta"} widthClass="max-w-2xl">
        <FormError message={formError} />
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Pergunta</span>
            <input type="text" value={form.texto} onChange={(e) => updateForm({ texto: e.target.value })} className="input" />
          </label>

          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Orientação (opcional)</span>
            <input
              type="text"
              value={form.orientacao}
              onChange={(e) => updateForm({ orientacao: e.target.value })}
              placeholder="Texto de apoio exibido abaixo da pergunta"
              className="input"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Tipo de resposta</span>
              <select value={form.tipo} onChange={(e) => updateForm({ tipo: e.target.value as FechamentoTipoResposta })} className="input">
                {Object.entries(TIPO_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 mt-5">
              <input type="checkbox" checked={form.obrigatoria} onChange={(e) => updateForm({ obrigatoria: e.target.checked })} />
              <span className="text-sm text-white">Obrigatória</span>
            </label>
          </div>

          {editingId && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.ativa} onChange={(e) => updateForm({ ativa: e.target.checked })} />
              <span className="text-sm text-white">Ativa (aparece nos formulários)</span>
            </label>
          )}

          {TIPOS_COM_OPCOES.includes(form.tipo) && (
            <div>
              <span className="block text-xs text-nord-gray mb-1">Opções</span>
              <div className="space-y-2">
                {form.opcoes.map((o, idx) => (
                  <div key={o.id ?? idx} className="flex items-center gap-2">
                    <input type="text" value={o.texto} onChange={(e) => updateOpcao(idx, e.target.value)} className="input" />
                    <button onClick={() => removeOpcao(idx)} className="text-nord-gray hover:text-red-400 shrink-0">
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={addOpcao} className="mt-2 flex items-center gap-1.5 text-xs text-nord-blue-light hover:underline">
                <Plus size={13} /> Adicionar opção
              </button>
            </div>
          )}

          <div>
            <span className="block text-xs text-nord-gray mb-1">Aparece nos formulários de</span>
            <div className="flex flex-wrap gap-2">
              {cargos.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCargo(c.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    form.cargoIds.includes(c.id) ? "bg-nord-blue border-nord-blue text-white" : "bg-nord-panel border-nord-border text-white"
                  }`}
                >
                  {c.nome}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-nord-border space-y-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Depende de outra pergunta (opcional)</span>
              <select
                value={form.perguntaPaiId}
                onChange={(e) => updateForm({ perguntaPaiId: e.target.value, valorPaiQueExibe: "" })}
                className="input"
              >
                <option value="">Nenhuma — sempre aparece</option>
                {perguntas
                  .filter((p) => TIPOS_CONDICIONAVEIS.includes(p.tipo) && p.id !== editingId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.texto}
                    </option>
                  ))}
              </select>
            </label>

            {perguntaPai && (
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Só aparece quando a resposta acima for</span>
                {perguntaPai.tipo === "SIM_NAO" ? (
                  <select value={form.valorPaiQueExibe} onChange={(e) => updateForm({ valorPaiQueExibe: e.target.value })} className="input">
                    <option value="">Selecione...</option>
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                ) : (
                  <select value={form.valorPaiQueExibe} onChange={(e) => updateForm({ valorPaiQueExibe: e.target.value })} className="input">
                    <option value="">Selecione...</option>
                    {perguntaPai.opcoes.map((o) => (
                      <option key={o.id} value={o.texto}>
                        {o.texto}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}
          </div>

          {form.tipo === "SIM_NAO" && (
            <div className="pt-2 border-t border-nord-border space-y-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.abreOcorrencia} onChange={(e) => updateForm({ abreOcorrencia: e.target.checked })} />
                <span className="text-sm text-white">Resposta &quot;Sim&quot; abre uma Ocorrência automaticamente</span>
              </label>
              {form.abreOcorrencia && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs text-nord-gray mb-1">Categoria sugerida</span>
                    <select
                      value={form.categoriaSugeridaId}
                      onChange={(e) => updateForm({ categoriaSugeridaId: e.target.value })}
                      className="input"
                    >
                      <option value="">Nenhuma</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs text-nord-gray mb-1">Gravidade sugerida</span>
                    <select
                      value={form.gravidadeSugerida}
                      onChange={(e) => updateForm({ gravidadeSugerida: e.target.value as FechamentoGravidade })}
                      className="input"
                    >
                      <option value="">Nenhuma</option>
                      {GRAVIDADE_OPTIONS.map((g) => (
                        <option key={g.key} value={g.key}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}

          <button
            onClick={submit}
            disabled={saving}
            className="bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar pergunta"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir pergunta"
        message={
          deleteError ||
          (deleteTarget && deleteTarget._count.respostas > 0
            ? `Essa pergunta já tem respostas registradas em fechamentos anteriores — ela vai ser desativada (sai dos formulários novos, mas o histórico é preservado), não excluída de verdade.`
            : `Tem certeza que deseja excluir a pergunta "${deleteTarget?.texto}"? Essa ação não pode ser desfeita.`)
        }
        confirmLabel={deleting ? "Excluindo..." : "Excluir"}
        danger
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
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
    </div>
  );
}
