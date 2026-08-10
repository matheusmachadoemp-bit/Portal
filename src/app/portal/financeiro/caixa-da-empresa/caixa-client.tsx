"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Section, Badge, StatCard } from "@/components/ui/stat-card";
import { Modal, FormError } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/calc";
import { format } from "date-fns";
import { apiRequest } from "@/lib/api-client";

type MovementDTO = {
  id: string;
  type: string;
  valor: number;
  descricao: string | null;
  date: string;
  bankAccount: { name: string };
  destino: { name: string } | null;
  createdBy: { name: string };
};

const TYPE_LABEL: Record<string, string> = {
  ENTRADA: "Adicionar dinheiro",
  SAIDA: "Retirar dinheiro",
  TRANSFERENCIA: "Transferência entre contas",
  APORTE_SOCIO: "Aporte dos sócios",
  RETIRADA_SOCIO: "Retirada dos sócios",
};

const TYPE_TONE: Record<string, "success" | "danger" | "info" | "warning"> = {
  ENTRADA: "success",
  SAIDA: "danger",
  TRANSFERENCIA: "info",
  APORTE_SOCIO: "success",
  RETIRADA_SOCIO: "warning",
};

const emptyForm = {
  type: "ENTRADA",
  bankAccountId: "",
  destinoId: "",
  valor: "",
  descricao: "",
  date: format(new Date(), "yyyy-MM-dd"),
};

export function CaixaClient({
  initialMovements,
  accounts,
  canCreate = true,
}: {
  initialMovements: MovementDTO[];
  accounts: { id: string; name: string; saldoAtual: number }[];
  canCreate?: boolean;
}) {
  const [movements, setMovements] = useState(initialMovements);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, bankAccountId: accounts[0]?.id ?? "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalCaixa = accounts.reduce((a, acc) => a + acc.saldoAtual, 0);

  async function refresh() {
    const res = await fetch("/api/financeiro/caixa");
    const data = await res.json();
    setMovements(data.movements);
  }

  async function submit() {
    if (!form.bankAccountId || !form.valor) {
      setFormError("Selecione a conta e informe o valor.");
      return;
    }
    setFormError(null);
    setSaving(true);
    const result = await apiRequest("/api/financeiro/caixa", "POST", form);
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setShowForm(false);
    setForm({ ...emptyForm, bankAccountId: accounts[0]?.id ?? "" });
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Caixa total" value={formatCurrency(totalCaixa)} icon="Vault" />
        {accounts.slice(0, 3).map((a) => (
          <StatCard key={a.id} label={a.name} value={formatCurrency(a.saldoAtual)} icon="Landmark" />
        ))}
      </div>

      <Section
        title="Movimentações do caixa"
        action={
          canCreate ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              <Plus size={13} /> Nova movimentação
            </button>
          ) : undefined
        }
      >
        {!canCreate && (
          <p className="mb-3 text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
            Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
            registrar movimentações.
          </p>
        )}
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Tipo</th>
                <th className="py-2 pr-4">Conta</th>
                <th className="py-2 pr-4">Destino</th>
                <th className="py-2 pr-4">Valor</th>
                <th className="py-2 pr-4">Descrição</th>
                <th className="py-2 pr-4">Usuário</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2 pr-4 text-nord-gray">{format(new Date(m.date), "dd/MM/yyyy")}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={TYPE_TONE[m.type]}>{TYPE_LABEL[m.type]}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-white">{m.bankAccount.name}</td>
                  <td className="py-2 pr-4 text-nord-gray">{m.destino?.name ?? "-"}</td>
                  <td className="py-2 pr-4 text-nord-gray">{formatCurrency(m.valor)}</td>
                  <td className="py-2 pr-4 text-nord-gray">{m.descricao}</td>
                  <td className="py-2 pr-4 text-nord-gray">{m.createdBy.name}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-nord-gray text-sm">
                    Nenhuma movimentação registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nova movimentação de caixa">
        <FormError message={formError} />
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Tipo de movimentação</span>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">
              {form.type === "TRANSFERENCIA" ? "Conta de origem" : "Conta"}
            </span>
            <select
              value={form.bankAccountId}
              onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
              className="input"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {form.type === "TRANSFERENCIA" && (
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Conta de destino</span>
              <select
                value={form.destinoId}
                onChange={(e) => setForm({ ...form, destinoId: e.target.value })}
                className="input"
              >
                <option value="">Selecione...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Valor (R$)</span>
            <input type="number" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Data</span>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Descrição</span>
            <input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="input" />
          </label>
        </div>
        <button
          onClick={submit}
          disabled={saving}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {saving ? "Salvando..." : "Registrar movimentação"}
        </button>
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
