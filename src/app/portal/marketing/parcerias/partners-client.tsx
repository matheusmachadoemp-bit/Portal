"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, Trophy, ClipboardList } from "lucide-react";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { PeriodFilterBar } from "@/components/ui/period-filter";
import { formatCurrency, formatNumber, safeDiv } from "@/lib/calc";
import type { RollingPeriodKey } from "@/lib/periods";

type Partner = {
  id: string;
  nome: string;
  cupom: string;
  quantidadeUtilizada: number;
  vendas: number;
  gasto: number;
  observacoes: string | null;
  empresa: { name: string; color: string };
  createdBy: { name: string };
};

type PartnerEntry = {
  id: string;
  date: string;
  quantidadeUtilizada: number;
  vendas: number;
  gasto: number;
  observacoes: string | null;
  createdBy: { name: string };
};

const emptyPartnerForm = { nome: "", cupom: "", observacoes: "" };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function emptyEntryForm() {
  return { date: todayStr(), quantidadeUtilizada: "", vendas: "", gasto: "", observacoes: "" };
}

function retornoOf(p: { vendas: number; gasto: number }) {
  return p.vendas - p.gasto;
}

export function PartnersClient({
  initialPartners,
  canCreate,
  canCreateEntry,
  canEdit,
  canDelete,
}: {
  initialPartners: Partner[];
  canCreate: boolean;
  /** Permite "Adicionar lançamento" num parceiro já existente — mesma permissão
   * de `canCreate` (POST exige `canCreate`), mas sem a restrição de loja única,
   * já que o parceiro já tem empresaId fixa (ver comentário em page.tsx). */
  canCreateEntry: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  // Form de lançamento (criar/editar) usa uma permissão diferente conforme o
  // modo: "Novo lançamento" (editingEntry null) é uma criação (canCreateEntry);
  // "Editar lançamento" é uma edição de registro existente (canEdit).
  const canShowEntryForm = (entry: PartnerEntry | null) => (entry ? canEdit : canCreateEntry);
  const [partners, setPartners] = useState(initialPartners);

  // Filtro de período do ranking (padrão do portal) — os números de cada
  // parceiro (quantidadeUtilizada/vendas/gasto) são a soma dos lançamentos
  // (MarketingPartnerEntry) dentro do período escolhido, calculada no
  // servidor (ver GET /api/marketing/partners).
  const [periodo, setPeriodo] = useState<RollingPeriodKey>("mes-atual");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loadingPeriodo, setLoadingPeriodo] = useState(false);
  const [periodoError, setPeriodoError] = useState<string | null>(null);

  // Cadastro do parceiro (nome/cupom/observações) — sem vendas/gasto/qtd.,
  // que agora só existem por lançamento (ver seção de Lançamentos abaixo).
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [form, setForm] = useState(emptyPartnerForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Lançamentos (MarketingPartnerEntry) do parceiro selecionado.
  const [entriesPartner, setEntriesPartner] = useState<Partner | null>(null);
  const [entries, setEntries] = useState<PartnerEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<PartnerEntry | null>(null);
  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [submittingEntry, setSubmittingEntry] = useState(false);
  const [confirmDeleteEntryId, setConfirmDeleteEntryId] = useState<string | null>(null);

  const ranking = useMemo(() => {
    return [...partners].sort((a, b) => retornoOf(b) - retornoOf(a));
  }, [partners]);

  const totals = useMemo(() => {
    const vendas = partners.reduce((sum, p) => sum + p.vendas, 0);
    const gasto = partners.reduce((sum, p) => sum + p.gasto, 0);
    const usos = partners.reduce((sum, p) => sum + p.quantidadeUtilizada, 0);
    return { vendas, gasto, retorno: vendas - gasto, usos };
  }, [partners]);

  async function fetchPartners(key: RollingPeriodKey, from?: string, to?: string) {
    const params = new URLSearchParams({ key });
    if (key === "personalizado" && from && to) {
      params.set("from", from);
      params.set("to", to);
    }
    const res = await fetch(`/api/marketing/partners?${params.toString()}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    setPartners(data.partners);
  }

  async function applyPeriodo(key: RollingPeriodKey, from?: string, to?: string) {
    setPeriodo(key);
    if (key === "personalizado" && from && to) {
      setCustomFrom(from);
      setCustomTo(to);
    }
    setLoadingPeriodo(true);
    setPeriodoError(null);
    try {
      await fetchPartners(key, from, to);
    } catch {
      setPeriodoError("Não foi possível carregar os dados desse período.");
    } finally {
      setLoadingPeriodo(false);
    }
  }

  // Reaplica o período atualmente selecionado — usado depois de qualquer
  // criação/edição/exclusão (parceiro ou lançamento), pra manter os totais
  // do ranking em dia com o filtro que o usuário já escolheu.
  async function refreshCurrentPeriodo() {
    try {
      await fetchPartners(periodo, customFrom, customTo);
    } catch {
      setPeriodoError("Não foi possível atualizar os dados.");
    }
  }

  function openNew() {
    setEditing(null);
    setForm(emptyPartnerForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(p: Partner) {
    setEditing(p);
    setForm({ nome: p.nome, cupom: p.cupom, observacoes: p.observacoes ?? "" });
    setFormError(null);
    setShowForm(true);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const url = editing ? `/api/marketing/partners/${editing.id}` : "/api/marketing/partners";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error ?? "Não foi possível salvar o parceiro.");
        return;
      }
      setShowForm(false);
      await refreshCurrentPeriodo();
    } finally {
      setSubmitting(false);
    }
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    const res = await fetch(`/api/marketing/partners/${confirmDeleteId}`, { method: "DELETE" });
    const wasEntriesPartner = entriesPartner?.id === confirmDeleteId;
    setConfirmDeleteId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setActionError(data.error ?? "Não foi possível excluir o parceiro.");
      return;
    }
    setActionError(null);
    if (wasEntriesPartner) closeEntries();
    await refreshCurrentPeriodo();
  }

  async function openEntries(p: Partner) {
    setEntriesPartner(p);
    setEditingEntry(null);
    setEntryForm(emptyEntryForm());
    setEntries([]);
    setEntriesError(null);
    setEntriesLoading(true);
    try {
      const res = await fetch(`/api/marketing/partners/${p.id}/entries`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEntries(data.entries);
    } catch {
      setEntriesError("Não foi possível carregar os lançamentos.");
    } finally {
      setEntriesLoading(false);
    }
  }

  function closeEntries() {
    setEntriesPartner(null);
    setEntries([]);
    setEditingEntry(null);
    setEntryForm(emptyEntryForm());
    setEntriesError(null);
  }

  function openEditEntry(e: PartnerEntry) {
    setEditingEntry(e);
    setEntryForm({
      date: e.date.slice(0, 10),
      quantidadeUtilizada: String(e.quantidadeUtilizada),
      vendas: String(e.vendas),
      gasto: String(e.gasto),
      observacoes: e.observacoes ?? "",
    });
  }

  function cancelEditEntry() {
    setEditingEntry(null);
    setEntryForm(emptyEntryForm());
  }

  async function reloadEntries() {
    if (!entriesPartner) return;
    const res = await fetch(`/api/marketing/partners/${entriesPartner.id}/entries`);
    if (!res.ok) return;
    const data = await res.json();
    setEntries(data.entries);
  }

  async function submitEntry() {
    if (!entriesPartner || submittingEntry) return;
    setSubmittingEntry(true);
    setEntriesError(null);
    try {
      const url = editingEntry
        ? `/api/marketing/partners/${entriesPartner.id}/entries/${editingEntry.id}`
        : `/api/marketing/partners/${entriesPartner.id}/entries`;
      const res = await fetch(url, {
        method: editingEntry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entryForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setEntriesError(d.error ?? "Não foi possível salvar o lançamento.");
        return;
      }
      setEditingEntry(null);
      setEntryForm(emptyEntryForm());
      await reloadEntries();
      await refreshCurrentPeriodo();
    } finally {
      setSubmittingEntry(false);
    }
  }

  async function doDeleteEntry() {
    if (!confirmDeleteEntryId || !entriesPartner) return;
    const res = await fetch(`/api/marketing/partners/${entriesPartner.id}/entries/${confirmDeleteEntryId}`, {
      method: "DELETE",
    });
    setConfirmDeleteEntryId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setEntriesError(data.error ?? "Não foi possível excluir o lançamento.");
      return;
    }
    setEntriesError(null);
    if (editingEntry?.id === confirmDeleteEntryId) {
      setEditingEntry(null);
      setEntryForm(emptyEntryForm());
    }
    await reloadEntries();
    await refreshCurrentPeriodo();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <PeriodFilterBar periodo={periodo} onApply={applyPeriodo} loading={loadingPeriodo} />
          {periodoError && <p className="text-xs text-nord-danger mt-2">{periodoError}</p>}
        </div>
        {canCreate && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium shrink-0"
          >
            <Plus size={13} /> Novo parceiro
          </button>
        )}
      </div>

      <FormError message={actionError} />

      <SortableStatCards
        storageKey="marketing-parcerias-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "cupons-usados", label: "Cupons usados", value: formatNumber(totals.usos), icon: "Ticket" },
          { key: "vendas-geradas", label: "Vendas geradas", value: formatCurrency(totals.vendas), icon: "TrendingUp", color: "#22c55e" },
          { key: "gasto-parceiros", label: "Gasto com parceiros", value: formatCurrency(totals.gasto), icon: "Wallet", color: "#eab308" },
          {
            key: "retorno-liquido",
            label: "Retorno líquido",
            value: formatCurrency(totals.retorno),
            icon: "Trophy",
            color: totals.retorno >= 0 ? "#22c55e" : "#ef4444",
          },
        ]}
      />

      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-3 px-4">#</th>
              <th className="py-3 px-4">Nome</th>
              <th className="py-3 px-4">Cupom</th>
              <th className="py-3 px-4">Qtd. utilizada</th>
              <th className="py-3 px-4">Vendas</th>
              <th className="py-3 px-4">Gasto</th>
              <th className="py-3 px-4">Retorno</th>
              <th className="py-3 px-4">ROI</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((p, i) => {
              const retorno = retornoOf(p);
              const roi = safeDiv(retorno, p.gasto || 1) * 100;
              return (
                <tr key={p.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 px-4">
                    {i === 0 ? (
                      <span className="flex items-center gap-1 text-amber-400 font-semibold">
                        <Trophy size={13} /> 1º
                      </span>
                    ) : (
                      <span className="text-nord-gray">{i + 1}º</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-white font-medium">{p.nome}</td>
                  <td className="py-2.5 px-4 text-nord-gray">
                    <code className="bg-nord-panel px-1.5 py-0.5 rounded text-xs">{p.cupom}</code>
                  </td>
                  <td className="py-2.5 px-4 text-nord-gray">{formatNumber(p.quantidadeUtilizada)}</td>
                  <td className="py-2.5 px-4 text-white">{formatCurrency(p.vendas)}</td>
                  <td className="py-2.5 px-4 text-nord-gray">{formatCurrency(p.gasto)}</td>
                  <td className={`py-2.5 px-4 font-medium ${retorno >= 0 ? "text-nord-success" : "text-nord-danger"}`}>
                    {formatCurrency(retorno)}
                  </td>
                  <td className={`py-2.5 px-4 font-medium ${roi >= 0 ? "text-nord-success" : "text-nord-danger"}`}>
                    {formatNumber(roi, 1)}%
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => openEntries(p)}
                        title="Lançamentos"
                        className="text-nord-gray hover:text-nord-blue-light"
                      >
                        <ClipboardList size={14} />
                      </button>
                      {canEdit && (
                        <button onClick={() => openEdit(p)} title="Editar cadastro" className="text-nord-gray hover:text-white">
                          <Pencil size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setConfirmDeleteId(p.id)} title="Excluir parceiro" className="text-nord-gray hover:text-nord-danger">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {ranking.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-nord-gray text-sm">
                  Nenhum parceiro/influencer cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setFormError(null);
        }}
        title={editing ? "Editar parceiro" : "Novo parceiro"}
        widthClass="max-w-lg"
      >
        <FormError message={formError} />
        <div className="grid grid-cols-1 gap-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="input" placeholder="Ex: @influencer" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Cupom</span>
            <input value={form.cupom} onChange={(e) => setForm({ ...form, cupom: e.target.value.toUpperCase() })} className="input" placeholder="Ex: NOME10" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Observações</span>
            <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="input min-h-16" />
          </label>
        </div>
        <p className="text-xs text-nord-gray mt-3">
          Vendas, gasto e quantidade utilizada não são mais cadastrados aqui — lance esses números por período em
          &quot;Lançamentos&quot;, depois de salvar o parceiro.
        </p>
        <button
          onClick={submit}
          disabled={!form.nome.trim() || !form.cupom.trim() || submitting}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {submitting ? "Salvando..." : "Salvar"}
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir parceiro"
        message="Tem certeza que deseja excluir este parceiro/influencer? Todos os lançamentos dele também serão excluídos."
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />

      <Modal
        open={!!entriesPartner}
        onClose={closeEntries}
        title={`Lançamentos — ${entriesPartner?.nome ?? ""}`}
        widthClass="max-w-2xl"
      >
        {entriesPartner && (
          <div className="space-y-4">
            <p className="text-xs text-nord-gray">
              Cupom <code className="bg-nord-panel px-1.5 py-0.5 rounded text-xs">{entriesPartner.cupom}</code> — registre um
              lançamento por período (ex.: um por mês) com a quantidade de usos, vendas geradas e gasto naquele intervalo. O
              ranking soma os lançamentos dentro do período filtrado na tela.
            </p>

            {entriesError && <p className="text-xs text-nord-danger">{entriesError}</p>}

            <div className="space-y-2 max-h-64 overflow-y-auto nord-scrollbar">
              {entriesLoading && <p className="text-xs text-nord-gray text-center py-4">Carregando...</p>}
              {!entriesLoading && entries.length === 0 && (
                <p className="text-xs text-nord-gray text-center py-4">Nenhum lançamento registrado ainda.</p>
              )}
              {!entriesLoading &&
                entries.map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-2 text-sm border-b border-nord-border/60 pb-2 last:border-0">
                    <div className="min-w-0">
                      <span className="text-white font-medium">{format(new Date(e.date), "dd/MM/yyyy")}</span>
                      <span className="text-nord-gray ml-2">
                        {formatNumber(e.quantidadeUtilizada)} usos · {formatCurrency(e.vendas)} vendas · {formatCurrency(e.gasto)} gasto
                      </span>
                      {e.observacoes && <p className="text-xs text-nord-gray/80 mt-0.5">{e.observacoes}</p>}
                    </div>
                    {(canEdit || canDelete) && (
                      <div className="flex items-center gap-2 shrink-0">
                        {canEdit && (
                          <button onClick={() => openEditEntry(e)} title="Editar lançamento" className="text-nord-gray hover:text-white">
                            <Pencil size={13} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setConfirmDeleteEntryId(e.id)}
                            title="Excluir lançamento"
                            className="text-nord-gray hover:text-nord-danger"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>

            {canShowEntryForm(editingEntry) && (
              <div className="border-t border-nord-border pt-4">
                <p className="text-xs text-nord-gray mb-2">{editingEntry ? "Editar lançamento" : "Novo lançamento"}</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs text-nord-gray mb-1">Data</span>
                    <input
                      type="date"
                      value={entryForm.date}
                      onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })}
                      className="input"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-nord-gray mb-1">Quantidade utilizada</span>
                    <input
                      type="number"
                      value={entryForm.quantidadeUtilizada}
                      onChange={(e) => setEntryForm({ ...entryForm, quantidadeUtilizada: e.target.value })}
                      className="input"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-nord-gray mb-1">Vendas (R$)</span>
                    <input
                      type="number"
                      value={entryForm.vendas}
                      onChange={(e) => setEntryForm({ ...entryForm, vendas: e.target.value })}
                      className="input"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-nord-gray mb-1">Gasto (R$)</span>
                    <input
                      type="number"
                      value={entryForm.gasto}
                      onChange={(e) => setEntryForm({ ...entryForm, gasto: e.target.value })}
                      className="input"
                    />
                  </label>
                  <label className="block col-span-2">
                    <span className="block text-xs text-nord-gray mb-1">Observações</span>
                    <textarea
                      value={entryForm.observacoes}
                      onChange={(e) => setEntryForm({ ...entryForm, observacoes: e.target.value })}
                      className="input min-h-14"
                    />
                  </label>
                </div>
                <div className="flex gap-2 mt-3">
                  {editingEntry && (
                    <button
                      onClick={cancelEditEntry}
                      className="px-4 py-2 text-xs rounded-lg border border-nord-border text-nord-gray hover:text-white hover:border-white/30"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    onClick={submitEntry}
                    disabled={!entryForm.date || submittingEntry}
                    className="flex-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2"
                  >
                    {submittingEntry ? "Salvando..." : editingEntry ? "Salvar lançamento" : "Adicionar lançamento"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteEntryId}
        title="Excluir lançamento"
        message="Tem certeza que deseja excluir este lançamento?"
        onConfirm={doDeleteEntry}
        onCancel={() => setConfirmDeleteEntryId(null)}
        confirmLabel="Excluir"
        danger
      />

    </div>
  );
}
