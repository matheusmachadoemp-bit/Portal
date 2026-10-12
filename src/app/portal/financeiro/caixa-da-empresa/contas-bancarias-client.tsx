"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Link2 } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { IconPicker, ColorPicker } from "@/components/ui/icon-picker";
import { DynamicIcon } from "@/components/dynamic-icon";
import { formatCurrency } from "@/lib/calc";
import { apiRequest } from "@/lib/api-client";
import { dayMonthTime, formatSince, isBankSyncStale } from "@/lib/relative-time";

export type AccountDTO = {
  id: string;
  name: string;
  bank: string | null;
  agencia: string | null;
  conta: string | null;
  tipo: string;
  saldoInicial: number;
  saldoAtual: number;
  color: string;
  icon: string;
  active: boolean;
  /** Id desta conta na conexão com o banco (Open Finance); preenchido = os lançamentos chegam sozinhos. */
  openFinanceAccountId: string | null;
  lastSyncAt: string | null;
  bankBalance: number | null;
  bankBalanceAt: string | null;
};

const emptyForm = {
  name: "",
  bank: "",
  agencia: "",
  conta: "",
  tipo: "Conta Corrente",
  saldoInicial: "0",
  color: "#2952E3",
  icon: "Landmark",
  openFinanceAccountId: "",
};

export function ContasBancariasClient({
  accounts,
  onAccountsChange,
  canCreate = true,
  canLinkBank = false,
  isGrupoNordMode = true,
}: {
  /** Lista completa (ativas e inativas) — dono do estado é o CaixaClient (página Caixa da Empresa), para manter os cards de saldo e o dropdown de "Nova movimentação" sincronizados com qualquer mudança feita aqui. */
  accounts: AccountDTO[];
  /** Chamado com a lista atualizada (buscada de novo da API) após qualquer criação/edição/ativação/exclusão. */
  onAccountsChange: (accounts: AccountDTO[]) => void;
  canCreate?: boolean;
  /** Só administrador/gestor liga a conta à conexão com o banco; os outros cargos veem o campo travado. */
  canLinkBank?: boolean;
  /** Diferencia por que `canCreate` é falso: modo Grupo Nord (consolidado) ou permissão do perfil numa loja específica. */
  isGrupoNordMode?: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AccountDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // "Agora" só depois de montar (evita diferença entre servidor e navegador no "atualizada há X").
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  async function refresh() {
    const res = await fetch("/api/financeiro/bank-accounts");
    const data = await res.json();
    onAccountsChange(data.accounts);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(a: AccountDTO) {
    setEditing(a);
    setForm({
      name: a.name,
      bank: a.bank ?? "",
      agencia: a.agencia ?? "",
      conta: a.conta ?? "",
      tipo: a.tipo,
      saldoInicial: String(a.saldoInicial),
      color: a.color,
      icon: a.icon,
      openFinanceAccountId: a.openFinanceAccountId ?? "",
    });
    setShowForm(true);
  }

  async function submit() {
    if (saving) return;
    if (!form.name.trim()) {
      setFormError("Informe o nome da conta.");
      return;
    }
    setFormError(null);
    setSaving(true);
    // O ID da conexão com o banco só vai junto se foi de fato alterado por quem pode (o servidor
    // também confere o cargo): um formulário aberto há tempo não pode desligar/trocar a ligação sem querer.
    const { openFinanceAccountId, ...rest } = form;
    const linkChanged = !!editing && canLinkBank && openFinanceAccountId.trim() !== (editing.openFinanceAccountId ?? "");
    const result = editing
      ? await apiRequest(`/api/financeiro/bank-accounts/${editing.id}`, "PATCH", linkChanged ? { ...rest, openFinanceAccountId } : rest)
      : await apiRequest("/api/financeiro/bank-accounts", "POST", rest);
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setShowForm(false);
    refresh();
  }

  async function toggleActive(a: AccountDTO) {
    setRowError(null);
    const result = await apiRequest(`/api/financeiro/bank-accounts/${a.id}`, "PATCH", {
      active: !a.active,
    });
    if (!result.ok) {
      setRowError(result.error);
      return;
    }
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    const result = await apiRequest(`/api/financeiro/bank-accounts/${confirmDeleteId}`, "DELETE");
    if (!result.ok) {
      setRowError(result.error);
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <Section
      title="Contas Bancárias"
      action={
        canCreate ? (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Nova conta
          </button>
        ) : undefined
      }
    >
      {!canCreate && (
        <p className="mb-4 text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          {isGrupoNordMode
            ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para cadastrar ou editar contas bancárias."
            : "Seu perfil de permissão não permite cadastrar ou editar contas bancárias neste módulo."}
        </p>
      )}
      <FormError message={rowError} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map((a) => (
          <div key={a.id} className="nord-card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${a.color}22` }}>
                  <DynamicIcon name={a.icon} size={15} style={{ color: a.color }} />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-nord-gray">{a.tipo}</p>
                </div>
              </div>
              <Badge tone={a.active ? "success" : "danger"}>{a.active ? "Ativa" : "Inativa"}</Badge>
            </div>
            <p className="text-lg text-white font-semibold">{formatCurrency(a.saldoAtual)}</p>
            <p className="text-xs text-nord-gray">
              {a.bank} {a.agencia && `• Ag. ${a.agencia}`} {a.conta && `• Conta ${a.conta}`}
            </p>
            {a.openFinanceAccountId && (
              <p
                className={`flex items-center gap-1.5 text-xs ${
                  !a.active ? "text-nord-gray" : now && isBankSyncStale(a.lastSyncAt, now) ? "text-nord-warning" : "text-nord-blue-light"
                }`}
                title="Os lançamentos desta conta chegam do banco automaticamente (Conciliação Bancária)."
              >
                <Link2 size={12} className="shrink-0" />
                {!a.active
                  ? "Conexão pausada (conta inativa)"
                  : a.lastSyncAt
                    ? `Conectada ao banco · atualizada ${now ? formatSince(a.lastSyncAt, now) : `em ${dayMonthTime(a.lastSyncAt)}`}`
                    : "Conectada ao banco · aguardando a primeira atualização"}
              </p>
            )}
            <div className={`flex items-center gap-2 pt-2 border-t border-nord-border/60 mt-1 ${!canCreate ? "hidden" : ""}`}>
              <button onClick={() => openEdit(a)} className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-white py-1.5">
                <Pencil size={12} /> Editar
              </button>
              <button onClick={() => toggleActive(a)} className="flex-1 text-xs text-nord-gray hover:text-white py-1.5">
                {a.active ? "Desativar" : "Ativar"}
              </button>
              <button onClick={() => setConfirmDeleteId(a.id)} className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-nord-danger py-1.5">
                <Trash2 size={12} /> Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar conta" : "Nova conta bancária"}>
        <FormError message={formError} />
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Nome da conta</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Banco</span>
            <input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Tipo</span>
            <input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Agência</span>
            <input value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Conta</span>
            <input value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} className="input" />
          </label>
          {!editing && (
            <label className="block col-span-2">
              <span className="block text-xs text-nord-gray mb-1">Saldo Inicial (R$)</span>
              <input type="number" value={form.saldoInicial} onChange={(e) => setForm({ ...form, saldoInicial: e.target.value })} className="input" />
            </label>
          )}
          {editing && (
            <label className="block col-span-2">
              <span className="block text-xs text-nord-gray mb-1">ID da conta na conexão com o banco (opcional)</span>
              <input
                value={form.openFinanceAccountId}
                onChange={(e) => setForm({ ...form, openFinanceAccountId: e.target.value })}
                placeholder="Cole aqui o ID informado pelo suporte"
                className="input font-mono text-xs disabled:opacity-60"
                autoComplete="off"
                disabled={!canLinkBank}
              />
              <span className="block text-[11px] text-nord-gray mt-1">
                Quando preenchido, os lançamentos desta conta chegam do banco sozinhos na Conciliação Bancária.{" "}
                {canLinkBank
                  ? "Deixe vazio para não usar a conexão."
                  : "Só administrador ou gestor pode alterar este campo."}
              </span>
            </label>
          )}
          <div className="col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Ícone</span>
            <IconPicker value={form.icon} onChange={(v) => setForm({ ...form, icon: v })} />
          </div>
          <div className="col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Cor</span>
            <ColorPicker value={form.color} onChange={(v) => setForm({ ...form, color: v })} />
          </div>
        </div>
        <button
          onClick={submit}
          disabled={saving}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir conta"
        message="Tem certeza que deseja excluir esta conta bancária?"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />

    </Section>
  );
}
