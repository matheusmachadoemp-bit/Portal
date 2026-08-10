"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { IconPicker, ColorPicker } from "@/components/ui/icon-picker";
import { DynamicIcon } from "@/components/dynamic-icon";
import { formatCurrency } from "@/lib/calc";
import { apiRequest } from "@/lib/api-client";

type AccountDTO = {
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
};

export function ContasBancariasClient({ initialAccounts }: { initialAccounts: AccountDTO[] }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AccountDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const res = await fetch("/api/financeiro/bank-accounts");
    const data = await res.json();
    setAccounts(data.accounts);
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
    });
    setShowForm(true);
  }

  async function submit() {
    if (!form.name.trim()) {
      setFormError("Informe o nome da conta.");
      return;
    }
    setFormError(null);
    setSaving(true);
    const result = editing
      ? await apiRequest(`/api/financeiro/bank-accounts/${editing.id}`, "PATCH", form)
      : await apiRequest("/api/financeiro/bank-accounts", "POST", form);
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
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
        >
          <Plus size={13} /> Nova conta
        </button>
      }
    >
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
            <div className="flex items-center gap-2 pt-2 border-t border-nord-border/60 mt-1">
              <button onClick={() => openEdit(a)} className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-white py-1.5">
                <Pencil size={12} /> Editar
              </button>
              <button onClick={() => toggleActive(a)} className="flex-1 text-xs text-nord-gray hover:text-white py-1.5">
                {a.active ? "Desativar" : "Ativar"}
              </button>
              <button onClick={() => setConfirmDeleteId(a.id)} className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-red-400 py-1.5">
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
    </Section>
  );
}
