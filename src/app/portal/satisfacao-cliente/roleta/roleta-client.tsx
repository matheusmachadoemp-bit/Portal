"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { IconPicker } from "@/components/ui/icon-picker";
import { DynamicIcon } from "@/components/dynamic-icon";
import { apiRequest } from "@/lib/api-client";
import { formatNumber, formatPercent } from "@/lib/calc";

/** Ícone-padrão de um prêmio sem imagem e sem ícone escolhido (registros antigos, criados direto
 *  pela API antes desta tela existir, podem ter `icone: null`) — só um fallback de exibição, nunca
 *  gravado sozinho no banco a menos que o usuário confirme salvando o formulário. */
const DEFAULT_PRIZE_ICON = "Gift";

type PremioDTO = {
  id: string;
  nome: string;
  descricao: string | null;
  imagemUrl: string | null;
  icone: string | null;
  quantidadeDisponivel: number | null;
  quantidadeGanha: number;
  probabilidadePercent: number;
  validadeDias: number;
  ativo: boolean;
  ordem: number;
};

type LoadResponse = { premios: PremioDTO[]; somaProbabilidadeAtivos: number };

type FormState = {
  nome: string;
  descricao: string;
  imagemUrl: string;
  icone: string;
  quantidadeDisponivel: string;
  probabilidadePercent: string;
  validadeDias: string;
};

function emptyForm(): FormState {
  return {
    nome: "",
    descricao: "",
    imagemUrl: "",
    icone: DEFAULT_PRIZE_ICON,
    quantidadeDisponivel: "",
    probabilidadePercent: "",
    validadeDias: "30",
  };
}

export function RoletaClient({
  canCreate,
  canEdit,
  canDelete,
  isGrupoNordMode,
}: {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isGrupoNordMode: boolean;
}) {
  const [data, setData] = useState<LoadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PremioDTO | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/satisfacao-cliente/roleta/premios");
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(json?.error ?? "Não foi possível carregar os prêmios da Roleta.");
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
    setUploadError(null);
    setModalOpen(true);
  }

  function openEdit(p: PremioDTO) {
    setEditing(p);
    setForm({
      nome: p.nome,
      descricao: p.descricao ?? "",
      imagemUrl: p.imagemUrl ?? "",
      icone: p.icone ?? DEFAULT_PRIZE_ICON,
      quantidadeDisponivel: p.quantidadeDisponivel === null ? "" : String(p.quantidadeDisponivel),
      probabilidadePercent: String(p.probabilidadePercent),
      validadeDias: String(p.validadeDias),
    });
    setFormError(null);
    setUploadError(null);
    setModalOpen(true);
  }

  async function handlePhotoUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
      setForm((f) => ({ ...f, imagemUrl: blob.url }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha ao enviar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (saving) return;
    if (!form.nome.trim()) {
      setFormError("Informe o nome do prêmio.");
      return;
    }
    if (form.probabilidadePercent.trim() === "" || !Number.isFinite(Number(form.probabilidadePercent))) {
      setFormError("Informe a probabilidade (%) do prêmio.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        imagemUrl: form.imagemUrl.trim() || null,
        icone: form.icone || null,
        quantidadeDisponivel: form.quantidadeDisponivel.trim() === "" ? null : Number(form.quantidadeDisponivel),
        probabilidadePercent: Number(form.probabilidadePercent),
        validadeDias: form.validadeDias.trim() === "" ? 30 : Number(form.validadeDias),
      };
      const result = editing
        ? await apiRequest(`/api/satisfacao-cliente/roleta/premios/${editing.id}`, "PATCH", payload)
        : await apiRequest("/api/satisfacao-cliente/roleta/premios", "POST", payload);
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

  async function toggleAtivo(p: PremioDTO) {
    setRowError(null);
    setBusyId(p.id);
    try {
      const result = await apiRequest(`/api/satisfacao-cliente/roleta/premios/${p.id}`, "PATCH", { ativo: !p.ativo });
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    setRowError(null);
    const result = await apiRequest(`/api/satisfacao-cliente/roleta/premios/${confirmDeleteId}`, "DELETE");
    setConfirmDeleteId(null);
    if (!result.ok) {
      setRowError(result.error);
      return;
    }
    await load();
  }

  const premios = data ? [...data.premios].sort((a, b) => a.ordem - b.ordem) : [];
  const ativos = premios.filter((p) => p.ativo);
  const totalGanhos = premios.reduce((sum, p) => sum + p.quantidadeGanha, 0);
  const somaAtivos = data?.somaProbabilidadeAtivos ?? 0;
  const chanceTenteNovamente = Math.max(0, 100 - somaAtivos);

  return (
    <div className="space-y-6">
      {data && (
        <SortableStatCards
          storageKey="satisfacao-cliente-roleta-kpi-order"
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          cards={[
            { key: "premios-cadastrados", label: "Prêmios cadastrados", value: formatNumber(premios.length), icon: "Gift" },
            {
              key: "premios-ativos",
              label: "Prêmios ativos",
              value: formatNumber(ativos.length),
              icon: "CheckCircle2",
              color: "#22c55e",
            },
            {
              key: "probabilidade-distribuida",
              label: "Probabilidade distribuída",
              value: formatPercent(somaAtivos, 2),
              icon: "Percent",
              hint: `${formatPercent(chanceTenteNovamente, 2)} vira "Tente novamente"`,
            },
            {
              key: "premios-ganhos",
              label: "Prêmios já ganhos",
              value: formatNumber(totalGanhos),
              icon: "Trophy",
              color: "#f59e0b",
            },
          ]}
        />
      )}

      {!canCreate && !loading && !loadError && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          {isGrupoNordMode
            ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para gerenciar os prêmios da Roleta."
            : "Seu perfil de permissão não permite criar ou editar prêmios da Roleta — você pode só visualizar esta tela."}
        </p>
      )}

      {loading ? (
        <div className="nord-card p-8 text-center text-sm text-nord-gray">Carregando...</div>
      ) : loadError ? (
        <div className="nord-card p-8 text-center text-sm text-nord-danger">{loadError}</div>
      ) : (
        data && (
          <Section
            title="Catálogo de prêmios"
            action={
              canCreate && (
                <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
                  <Plus size={13} /> Novo prêmio
                </button>
              )
            }
          >
            <FormError message={rowError} />
            {premios.length === 0 ? (
              <p className="text-sm text-nord-gray py-6 text-center">
                Nenhum prêmio cadastrado ainda. Crie o primeiro prêmio para poder usar a Roleta na pesquisa de
                satisfação do cliente.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {premios.map((p) => {
                  const estoqueInfo =
                    p.quantidadeDisponivel === null
                      ? "Sem limite de estoque"
                      : `${formatNumber(Math.max(p.quantidadeDisponivel - p.quantidadeGanha, 0))} restante(s) de ${formatNumber(p.quantidadeDisponivel)}`;
                  return (
                    <div key={p.id} className={`nord-card p-4 flex flex-col gap-3 ${!p.ativo ? "opacity-60" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {p.imagemUrl ? (
                            <Image
                              src={p.imagemUrl}
                              alt={p.nome}
                              width={44}
                              height={44}
                              className="w-11 h-11 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-lg bg-nord-panel flex items-center justify-center text-nord-gray shrink-0">
                              <DynamicIcon name={p.icone || DEFAULT_PRIZE_ICON} size={20} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-white font-medium text-sm truncate">{p.nome}</p>
                            {p.descricao && <p className="text-xs text-nord-gray truncate">{p.descricao}</p>}
                          </div>
                        </div>
                        <Badge tone={p.ativo ? "success" : "default"}>{p.ativo ? "Ativo" : "Inativo"}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-xs text-nord-gray">
                        <span>
                          Probabilidade: <span className="text-white">{formatPercent(p.probabilidadePercent, 2)}</span>
                        </span>
                        <span>
                          Já ganho: <span className="text-white">{formatNumber(p.quantidadeGanha)}x</span>
                        </span>
                        <span className="col-span-2">{estoqueInfo}</span>
                        <span className="col-span-2">Validade do código: {p.validadeDias} dia(s)</span>
                      </div>
                      {(canEdit || canDelete) && (
                        <div className="flex items-center gap-2 pt-2 border-t border-nord-border/60 mt-1">
                          {canEdit && (
                            <button
                              onClick={() => openEdit(p)}
                              className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-white py-1.5"
                            >
                              <Pencil size={12} /> Editar
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => toggleAtivo(p)}
                              disabled={busyId === p.id}
                              className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-white py-1.5 disabled:opacity-50"
                            >
                              {p.ativo ? "Desativar" : "Ativar"}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setConfirmDeleteId(p.id)}
                              className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-nord-danger py-1.5"
                            >
                              <Trash2 size={12} /> Excluir
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        )
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar prêmio" : "Novo prêmio"}
        widthClass="max-w-xl"
      >
        <FormError message={formError} />

        <div className="flex items-center gap-3 mb-4">
          {form.imagemUrl ? (
            <Image src={form.imagemUrl} alt="" width={64} height={64} className="w-16 h-16 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-nord-panel flex items-center justify-center text-nord-gray shrink-0">
              <DynamicIcon name={form.icone || DEFAULT_PRIZE_ICON} size={24} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-nord-blue-light hover:text-white cursor-pointer">
              {uploading ? "Enviando..." : "Enviar imagem do prêmio"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}
              />
            </label>
            {form.imagemUrl && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, imagemUrl: "" }))}
                className="text-xs text-nord-gray hover:text-nord-danger text-left"
              >
                Remover imagem
              </button>
            )}
          </div>
        </div>
        {uploadError && <p className="text-xs text-nord-danger mb-3">{uploadError}</p>}

        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome do prêmio</span>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="input"
              placeholder="Ex.: Refrigerante grátis"
            />
          </label>

          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Descrição (opcional)</span>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="input min-h-16"
              placeholder="Detalhes que aparecem pro cliente e pro funcionário no resgate"
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Probabilidade (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.probabilidadePercent}
                onChange={(e) => setForm({ ...form, probabilidadePercent: e.target.value })}
                className="input"
                placeholder="0"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Estoque (opcional)</span>
              <input
                type="number"
                min={0}
                step="1"
                value={form.quantidadeDisponivel}
                onChange={(e) => setForm({ ...form, quantidadeDisponivel: e.target.value })}
                className="input"
                placeholder="Sem limite"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Validade do código (dias)</span>
              <input
                type="number"
                min={1}
                step="1"
                value={form.validadeDias}
                onChange={(e) => setForm({ ...form, validadeDias: e.target.value })}
                className="input"
              />
            </label>
          </div>

          <p className="text-[11px] text-nord-gray">
            Hoje a soma dos prêmios ativos desta loja é {formatPercent(somaAtivos, 2)}. A soma de todos os prêmios
            ativos nunca pode passar de 100% — o que sobrar até lá vira a chance de &quot;Tente novamente&quot; no
            giro.
          </p>

          <div>
            <span className="block text-xs text-nord-gray mb-1.5">Ícone (usado só quando não há imagem)</span>
            <IconPicker value={form.icone || DEFAULT_PRIZE_ICON} onChange={(v) => setForm({ ...form, icone: v })} />
          </div>

          <button
            onClick={submit}
            disabled={saving || uploading}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar prêmio"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir prêmio"
        message="Tem certeza que deseja excluir este prêmio da Roleta? Essa ação não pode ser desfeita."
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />
    </div>
  );
}
