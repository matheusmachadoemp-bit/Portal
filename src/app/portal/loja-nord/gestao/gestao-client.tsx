"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { Plus, ImagePlus, Pencil } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  LOJA_NORD_REDEMPTION_STATUS_LABEL,
  LOJA_NORD_REDEMPTION_STATUS_TONE,
  LOJA_NORD_REWARD_CATEGORY_LABEL,
  LOJA_NORD_REWARD_CATEGORY_OPTIONS,
} from "@/lib/loja-nord";

type RewardDTO = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  imagemUrl: string | null;
  pontos: number;
  estoque: number | null;
  estoqueMinimo: number | null;
  limitePorColaborador: number | null;
  disponivelDe: string | null;
  disponivelAte: string | null;
  empresaIds: string[];
  exigeAprovacao: boolean;
  regras: string | null;
  active: boolean;
};

type RedemptionRow = {
  id: string;
  colaboradorNome: string;
  empresaNome: string;
  rewardNome: string;
  pontos: number;
  status: string;
  createdAt: string;
};

const emptyForm = {
  nome: "",
  descricao: "",
  categoria: "PRODUTOS_NORD",
  imagemUrl: "",
  pontos: "",
  estoque: "",
  estoqueMinimo: "",
  limitePorColaborador: "",
  disponivelDe: "",
  disponivelAte: "",
  empresaIds: [] as string[],
  exigeAprovacao: true,
  regras: "",
  active: true,
};

export function GestaoClient({
  canManageCatalog,
  empresas,
  initialRewards,
  initialRedemptions,
}: {
  canManageCatalog: boolean;
  empresas: { id: string; name: string }[];
  initialRewards: RewardDTO[];
  initialRedemptions: RedemptionRow[];
}) {
  const [rewards, setRewards] = useState(initialRewards);
  const [redemptions, setRedemptions] = useState(initialRedemptions);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RewardDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(r: RewardDTO) {
    setEditing(r);
    setForm({
      nome: r.nome,
      descricao: r.descricao ?? "",
      categoria: r.categoria,
      imagemUrl: r.imagemUrl ?? "",
      pontos: String(r.pontos),
      estoque: r.estoque === null ? "" : String(r.estoque),
      estoqueMinimo: r.estoqueMinimo === null ? "" : String(r.estoqueMinimo),
      limitePorColaborador: r.limitePorColaborador === null ? "" : String(r.limitePorColaborador),
      disponivelDe: r.disponivelDe ? r.disponivelDe.slice(0, 10) : "",
      disponivelAte: r.disponivelAte ? r.disponivelAte.slice(0, 10) : "",
      empresaIds: r.empresaIds,
      exigeAprovacao: r.exigeAprovacao,
      regras: r.regras ?? "",
      active: r.active,
    });
    setShowForm(true);
  }

  async function handlePhotoUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
      setForm((f) => ({ ...f, imagemUrl: blob.url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a foto.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setError(null);
    const payload = {
      nome: form.nome,
      descricao: form.descricao || null,
      categoria: form.categoria,
      imagemUrl: form.imagemUrl || null,
      pontos: Number(form.pontos),
      estoque: form.estoque === "" ? null : Number(form.estoque),
      estoqueMinimo: form.estoqueMinimo === "" ? null : Number(form.estoqueMinimo),
      limitePorColaborador: form.limitePorColaborador === "" ? null : Number(form.limitePorColaborador),
      disponivelDe: form.disponivelDe || null,
      disponivelAte: form.disponivelAte || null,
      empresaIds: form.empresaIds,
      exigeAprovacao: form.exigeAprovacao,
      regras: form.regras || null,
      active: form.active,
    };

    const res = await fetch(editing ? `/api/loja-nord/rewards/${editing.id}` : "/api/loja-nord/rewards", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Não foi possível salvar o brinde.");
      return;
    }

    if (editing) {
      setRewards((list) => list.map((r) => (r.id === editing.id ? data.reward : r)));
    } else {
      setRewards((list) => [data.reward, ...list]);
    }
    setShowForm(false);
  }

  async function toggleActive(r: RewardDTO) {
    const res = await fetch(`/api/loja-nord/rewards/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    if (res.ok) {
      setRewards((list) => list.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)));
    }
  }

  async function acao(id: string, action: string, extra?: Record<string, unknown>) {
    const res = await fetch(`/api/loja-nord/redemptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Não foi possível concluir a ação.");
      return;
    }
    if (action === "aprovar") {
      setRedemptions((list) => list.map((r) => (r.id === id ? { ...r, status: "APROVADO" } : r)));
    } else if (action === "disponivel") {
      setRedemptions((list) => list.map((r) => (r.id === id ? { ...r, status: "DISPONIVEL_RETIRADA" } : r)));
    } else if (action === "entregar" || action === "recusar") {
      setRedemptions((list) => list.filter((r) => r.id !== id));
    }
  }

  async function confirmarRecusa() {
    if (!recusando) return;
    if (!motivoRecusa.trim()) {
      setError("Informe uma justificativa para a recusa.");
      return;
    }
    await acao(recusando, "recusar", { motivo: motivoRecusa });
    setRecusando(null);
    setMotivoRecusa("");
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-xs text-nord-danger">{error}</p>}

      <Section title="Solicitações de resgate">
        {redemptions.length === 0 ? (
          <p className="text-sm text-nord-gray text-center py-6">Nenhuma solicitação pendente no momento.</p>
        ) : (
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 pr-4">Colaborador</th>
                  <th className="py-2 pr-4">Brinde</th>
                  <th className="py-2 pr-4">Loja</th>
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Pontos</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Ações</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => (
                  <tr key={r.id} className="border-b border-nord-border/50 hover:bg-white/5">
                    <td className="py-2 pr-4 text-white">{r.colaboradorNome}</td>
                    <td className="py-2 pr-4 text-nord-gray">{r.rewardNome}</td>
                    <td className="py-2 pr-4 text-nord-gray">{r.empresaNome}</td>
                    <td className="py-2 pr-4 text-nord-gray whitespace-nowrap">
                      {format(new Date(r.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                    </td>
                    <td className="py-2 pr-4 text-nord-danger">-{formatNumber(r.pontos)}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={LOJA_NORD_REDEMPTION_STATUS_TONE[r.status] ?? "default"}>
                        {LOJA_NORD_REDEMPTION_STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        {r.status === "AGUARDANDO_APROVACAO" && (
                          <>
                            <button onClick={() => acao(r.id, "aprovar")} className="text-xs text-nord-success hover:underline">
                              Aprovar
                            </button>
                            <button onClick={() => setRecusando(r.id)} className="text-xs text-nord-danger hover:underline">
                              Recusar
                            </button>
                          </>
                        )}
                        {r.status === "APROVADO" && (
                          <button onClick={() => acao(r.id, "disponivel")} className="text-xs text-nord-blue-light hover:underline">
                            Marcar disponível
                          </button>
                        )}
                        {r.status === "DISPONIVEL_RETIRADA" && (
                          <button onClick={() => acao(r.id, "entregar")} className="text-xs text-nord-success hover:underline">
                            Confirmar entrega
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Catálogo de brindes"
        action={
          canManageCatalog && (
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              <Plus size={13} /> Cadastrar brinde
            </button>
          )
        }
      >
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Brinde</th>
                <th className="py-2 pr-4">Categoria</th>
                <th className="py-2 pr-4">Pontos</th>
                <th className="py-2 pr-4">Estoque</th>
                <th className="py-2 pr-4">Limite/colaborador</th>
                <th className="py-2 pr-4">Status</th>
                {canManageCatalog && <th className="py-2 pr-4">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {rewards.map((r) => (
                <tr key={r.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      {r.imagemUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.imagemUrl} alt={r.nome} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-nord-panel flex items-center justify-center shrink-0">
                          <ImagePlus size={14} className="text-nord-gray" />
                        </div>
                      )}
                      <span className="text-white">{r.nome}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-nord-gray">{LOJA_NORD_REWARD_CATEGORY_LABEL[r.categoria] ?? r.categoria}</td>
                  <td className="py-2 pr-4 text-white font-medium">{formatNumber(r.pontos)}</td>
                  <td className="py-2 pr-4 text-nord-gray">{r.estoque === null ? "Ilimitado" : r.estoque}</td>
                  <td className="py-2 pr-4 text-nord-gray">{r.limitePorColaborador ?? "-"}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={r.active ? "success" : "default"}>{r.active ? "Ativo" : "Inativo"}</Badge>
                  </td>
                  {canManageCatalog && (
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(r)} className="text-nord-gray hover:text-white">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => toggleActive(r)} className="text-xs text-nord-gray hover:text-white">
                          {r.active ? "Desativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {rewards.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-nord-gray text-sm">
                    Nenhum brinde cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar brinde" : "Cadastrar brinde"} widthClass="max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          {form.imagemUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.imagemUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-nord-panel flex items-center justify-center text-nord-gray shrink-0">
              <ImagePlus size={20} />
            </div>
          )}
          <label className="text-xs text-nord-blue-light hover:text-white cursor-pointer">
            {uploading ? "Enviando..." : "Enviar foto do brinde"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}
            />
          </label>
        </div>

        {error && <p className="text-xs text-nord-danger mb-3">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Nome do brinde</span>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="input" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Descrição</span>
            <textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="input min-h-16" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Categoria</span>
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="input">
              {LOJA_NORD_REWARD_CATEGORY_OPTIONS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Quantidade de pontos</span>
            <input type="number" value={form.pontos} onChange={(e) => setForm({ ...form, pontos: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Estoque (vazio = ilimitado)</span>
            <input type="number" value={form.estoque} onChange={(e) => setForm({ ...form, estoque: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Estoque mínimo (alerta)</span>
            <input
              type="number"
              value={form.estoqueMinimo}
              onChange={(e) => setForm({ ...form, estoqueMinimo: e.target.value })}
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Limite por colaborador</span>
            <input
              type="number"
              value={form.limitePorColaborador}
              onChange={(e) => setForm({ ...form, limitePorColaborador: e.target.value })}
              className="input"
            />
          </label>
          <label className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              checked={form.exigeAprovacao}
              onChange={(e) => setForm({ ...form, exigeAprovacao: e.target.checked })}
            />
            <span className="text-xs text-nord-gray">Exige aprovação do gerente</span>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Disponível de</span>
            <input type="date" value={form.disponivelDe} onChange={(e) => setForm({ ...form, disponivelDe: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Disponível até</span>
            <input
              type="date"
              value={form.disponivelAte}
              onChange={(e) => setForm({ ...form, disponivelAte: e.target.value })}
              className="input"
            />
          </label>
          <div className="col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Lojas participantes (nenhuma marcada = todas)</span>
            <div className="flex flex-wrap gap-2">
              {empresas.map((e) => (
                <label key={e.id} className="flex items-center gap-1.5 text-xs text-nord-gray">
                  <input
                    type="checkbox"
                    checked={form.empresaIds.includes(e.id)}
                    onChange={(ev) =>
                      setForm({
                        ...form,
                        empresaIds: ev.target.checked ? [...form.empresaIds, e.id] : form.empresaIds.filter((id) => id !== e.id),
                      })
                    }
                  />
                  {e.name}
                </label>
              ))}
            </div>
          </div>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Regras de utilização</span>
            <textarea value={form.regras} onChange={(e) => setForm({ ...form, regras: e.target.value })} className="input min-h-16" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span className="text-xs text-nord-gray">Ativo</span>
          </label>
        </div>

        <button
          onClick={submit}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5"
        >
          Salvar
        </button>
      </Modal>

      <Modal open={!!recusando} onClose={() => setRecusando(null)} title="Recusar resgate">
        <p className="text-xs text-nord-gray mb-2">Toda recusa exige uma justificativa. O colaborador verá esse texto e os pontos serão devolvidos automaticamente.</p>
        <textarea
          value={motivoRecusa}
          onChange={(e) => setMotivoRecusa(e.target.value)}
          placeholder="Explique o motivo da recusa..."
          className="input min-h-20 mb-3"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setRecusando(null)}
            className="flex-1 px-4 py-2 text-sm rounded-lg border border-nord-border text-nord-gray hover:text-white hover:border-white/30"
          >
            Cancelar
          </button>
          <button onClick={confirmarRecusa} className="flex-1 px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium">
            Confirmar recusa
          </button>
        </div>
      </Modal>

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
