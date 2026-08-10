"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, Download, Copy } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/calc";
import { format } from "date-fns";
import { apiRequest } from "@/lib/api-client";

type ReceivableDTO = {
  id: string;
  number: string;
  cliente: string;
  descricao: string;
  categoriaId: string;
  categoria: { name: string; dreKey: string };
  centroCusto: string | null;
  empresa: { id: string; name: string; color: string };
  valor: number;
  dataCompetencia: string;
  dataVencimento: string;
  dataRecebimento: string | null;
  bankAccountId: string | null;
  bankAccount: { name: string } | null;
  formaRecebimento: string | null;
  parcelado: boolean;
  quantidadeParcelas: number | null;
  parcelaAtual: number | null;
  observacoes: string | null;
  status: string;
};

const STATUS_LABEL: Record<string, string> = {
  EM_ABERTO: "Em aberto",
  PAGO: "Pago",
  PARCIALMENTE_PAGO: "Parcialmente pago",
  CANCELADO: "Cancelado",
  ATRASADO: "Atrasado",
};

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  EM_ABERTO: "info",
  PAGO: "success",
  PARCIALMENTE_PAGO: "warning",
  CANCELADO: "default",
  ATRASADO: "danger",
};

const PAYMENT_METHODS = [
  "PIX",
  "DINHEIRO",
  "CARTAO_DEBITO",
  "CARTAO_CREDITO",
  "TED",
  "DOC",
  "TRANSFERENCIA",
  "CHEQUE",
  "OUTRO",
];

const emptyForm = {
  number: "",
  cliente: "",
  descricao: "",
  categoriaId: "",
  centroCusto: "",
  valor: "",
  dataCompetencia: format(new Date(), "yyyy-MM-dd"),
  dataVencimento: format(new Date(), "yyyy-MM-dd"),
  dataRecebimento: "",
  bankAccountId: "",
  formaRecebimento: "PIX",
  parcelado: false,
  quantidadeParcelas: "",
  parcelaAtual: "",
  observacoes: "",
  status: "EM_ABERTO",
};

export function ContasReceberClient({
  initialReceivables,
  categorias,
  contas,
  canCreate = true,
}: {
  initialReceivables: ReceivableDTO[];
  categorias: { id: string; name: string; dreKey: string }[];
  contas: { id: string; name: string }[];
  canCreate?: boolean;
}) {
  const [receivables, setReceivables] = useState(initialReceivables);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ReceivableDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      receivables
        .filter((p) => !filterStatus || p.status === filterStatus)
        .filter(
          (p) =>
            !search ||
            p.cliente.toLowerCase().includes(search.toLowerCase()) ||
            p.descricao.toLowerCase().includes(search.toLowerCase())
        ),
    [receivables, filterStatus, search]
  );

  const totalFiltrado = filtered.reduce((a, p) => a + p.valor, 0);

  async function refresh() {
    const res = await fetch("/api/financeiro/receber");
    const data = await res.json();
    setReceivables(data.receivables);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, categoriaId: categorias[0]?.id ?? "", bankAccountId: contas[0]?.id ?? "" });
    setShowForm(true);
  }

  function openEdit(p: ReceivableDTO) {
    setEditing(p);
    setForm({
      number: p.number,
      cliente: p.cliente,
      descricao: p.descricao,
      categoriaId: p.categoriaId,
      centroCusto: p.centroCusto ?? "",
      valor: String(p.valor),
      dataCompetencia: format(new Date(p.dataCompetencia), "yyyy-MM-dd"),
      dataVencimento: format(new Date(p.dataVencimento), "yyyy-MM-dd"),
      dataRecebimento: p.dataRecebimento ? format(new Date(p.dataRecebimento), "yyyy-MM-dd") : "",
      bankAccountId: p.bankAccountId ?? "",
      formaRecebimento: p.formaRecebimento ?? "PIX",
      parcelado: p.parcelado,
      quantidadeParcelas: p.quantidadeParcelas ? String(p.quantidadeParcelas) : "",
      parcelaAtual: p.parcelaAtual ? String(p.parcelaAtual) : "",
      observacoes: p.observacoes ?? "",
      status: p.status,
    });
    setShowForm(true);
  }

  async function submit() {
    if (!form.categoriaId) {
      setFormError("Selecione uma categoria financeira antes de salvar.");
      return;
    }
    setFormError(null);
    setSaving(true);
    const payload = { ...form, dataRecebimento: form.dataRecebimento || null };
    const result = editing
      ? await apiRequest(`/api/financeiro/receber/${editing.id}`, "PATCH", payload)
      : await apiRequest("/api/financeiro/receber", "POST", payload);
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setShowForm(false);
    refresh();
  }

  async function markReceived(p: ReceivableDTO) {
    setRowError(null);
    const result = await apiRequest(`/api/financeiro/receber/${p.id}`, "PATCH", {
      status: "PAGO",
      dataRecebimento: format(new Date(), "yyyy-MM-dd"),
    });
    if (!result.ok) {
      setRowError(result.error);
      return;
    }
    refresh();
  }

  async function duplicate(p: ReceivableDTO) {
    setRowError(null);
    const result = await apiRequest("/api/financeiro/receber", "POST", {
      cliente: p.cliente,
      descricao: `${p.descricao} (cópia)`,
      categoriaId: p.categoriaId,
      centroCusto: p.centroCusto,
      valor: p.valor,
      dataCompetencia: p.dataCompetencia,
      dataVencimento: p.dataVencimento,
      bankAccountId: p.bankAccountId,
      formaRecebimento: p.formaRecebimento,
      status: "EM_ABERTO",
    });
    if (!result.ok) {
      setRowError(result.error);
      return;
    }
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    const result = await apiRequest(`/api/financeiro/receber/${confirmDeleteId}`, "DELETE");
    if (!result.ok) {
      setRowError(result.error);
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(null);
    refresh();
  }

  function exportCsv() {
    const header = ["Número", "Cliente", "Descrição", "Categoria", "Empresa", "Valor", "Vencimento", "Status"];
    const rows = filtered.map((p) => [
      p.number,
      p.cliente,
      p.descricao,
      p.categoria.name,
      p.empresa.name,
      p.valor,
      format(new Date(p.dataVencimento), "dd/MM/yyyy"),
      STATUS_LABEL[p.status],
    ]);
    const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contas-a-receber.csv";
    a.click();
  }

  return (
    <Section
      title="Contas a Receber"
      action={
        <div className="flex items-center gap-2 flex-wrap">
          <input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-nord-panel border border-nord-border rounded-lg px-3 py-1.5 text-xs text-white w-40"
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-sm">
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white">
            <Download size={13} /> Excel
          </button>
          {canCreate && (
            <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium">
              <Plus size={13} /> Nova conta
            </button>
          )}
        </div>
      }
    >
      {!canCreate && (
        <p className="mb-3 text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
          lançar ou editar contas.
        </p>
      )}
      <FormError message={rowError} />
      <p className="text-xs text-nord-gray mb-3">
        Total filtrado: <span className="text-white font-medium">{formatCurrency(totalFiltrado)}</span> ({filtered.length} lançamentos)
      </p>
      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Nº</th>
              <th className="py-2 pr-4">Cliente</th>
              <th className="py-2 pr-4">Categoria</th>
              <th className="py-2 pr-4">Empresa</th>
              <th className="py-2 pr-4">Valor</th>
              <th className="py-2 pr-4">Vencimento</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2 pr-4 text-nord-gray">{p.number}</td>
                <td className="py-2 pr-4 text-white">{p.cliente}</td>
                <td className="py-2 pr-4 text-nord-gray">{p.categoria.name}</td>
                <td className="py-2 pr-4 text-nord-gray">{p.empresa.name}</td>
                <td className="py-2 pr-4 text-nord-gray">{formatCurrency(p.valor)}</td>
                <td className="py-2 pr-4 text-nord-gray">{format(new Date(p.dataVencimento), "dd/MM/yyyy")}</td>
                <td className="py-2 pr-4">
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </td>
                <td className="py-2 pr-4">
                  <div className={`flex items-center gap-2 justify-end ${!canCreate ? "hidden" : ""}`}>
                    {p.status !== "PAGO" && (
                      <button onClick={() => markReceived(p)} title="Marcar como recebido" className="text-nord-gray hover:text-emerald-400">
                        <Check size={14} />
                      </button>
                    )}
                    <button onClick={() => duplicate(p)} title="Duplicar" className="text-nord-gray hover:text-white">
                      <Copy size={14} />
                    </button>
                    <button onClick={() => openEdit(p)} className="text-nord-gray hover:text-white">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDeleteId(p.id)} className="text-nord-gray hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-nord-gray text-sm">
                  Nenhuma conta encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar conta a receber" : "Nova conta a receber"} widthClass="max-w-2xl">
        <FormError message={formError} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cliente">
            <input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} className="input" />
          </Field>
          <Field label="Descrição">
            <input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="input" />
          </Field>
          <Field label="Categoria Financeira (vínculo DRE obrigatório)">
            <select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })} className="input">
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Centro de custo">
            <input value={form.centroCusto} onChange={(e) => setForm({ ...form, centroCusto: e.target.value })} className="input" />
          </Field>
          <Field label="Valor (R$)">
            <input type="number" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="input" />
          </Field>
          <Field label="Data de Competência">
            <input type="date" value={form.dataCompetencia} onChange={(e) => setForm({ ...form, dataCompetencia: e.target.value })} className="input" />
          </Field>
          <Field label="Data de Vencimento">
            <input type="date" value={form.dataVencimento} onChange={(e) => setForm({ ...form, dataVencimento: e.target.value })} className="input" />
          </Field>
          <Field label="Data de Recebimento">
            <input type="date" value={form.dataRecebimento} onChange={(e) => setForm({ ...form, dataRecebimento: e.target.value })} className="input" />
          </Field>
          <Field label="Conta Bancária">
            <select value={form.bankAccountId} onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })} className="input">
              <option value="">—</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Forma de Recebimento">
            <select value={form.formaRecebimento} onChange={(e) => setForm({ ...form, formaRecebimento: e.target.value })} className="input">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="parcelado"
              checked={form.parcelado}
              onChange={(e) => setForm({ ...form, parcelado: e.target.checked })}
              className="accent-nord-blue"
            />
            <label htmlFor="parcelado" className="text-xs text-nord-gray">
              Parcelado
            </label>
          </div>
          {form.parcelado && (
            <>
              <Field label="Qtd. parcelas">
                <input type="number" value={form.quantidadeParcelas} onChange={(e) => setForm({ ...form, quantidadeParcelas: e.target.value })} className="input" />
              </Field>
              <Field label="Parcela atual">
                <input type="number" value={form.parcelaAtual} onChange={(e) => setForm({ ...form, parcelaAtual: e.target.value })} className="input" />
              </Field>
            </>
          )}
          <div className="col-span-2">
            <Field label="Observações">
              <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="input min-h-14" />
            </Field>
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
        title="Excluir conta a receber"
        message="Tem certeza? Se estava paga, o saldo da conta bancária será revertido."
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
        .input-sm {
          background: var(--nord-panel);
          border: 1px solid var(--nord-border);
          border-radius: 8px;
          padding: 6px 8px;
          color: white;
          font-size: 12px;
          outline: none;
        }
      `}</style>
    </Section>
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
