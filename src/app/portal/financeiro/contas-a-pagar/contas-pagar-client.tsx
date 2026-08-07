"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, Download, Copy, Repeat } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/calc";
import { format } from "date-fns";
import { COMPANY_LABEL } from "../finance-tabs";

type PayableDTO = {
  id: string;
  number: string;
  fornecedor: string;
  descricao: string;
  categoriaId: string;
  categoria: { name: string; dreKey: string };
  centroCusto: string | null;
  empresa: string;
  valor: number;
  dataCompetencia: string;
  dataVencimento: string;
  dataPagamento: string | null;
  bankAccountId: string | null;
  bankAccount: { name: string } | null;
  formaPagamento: string | null;
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
  fornecedor: "",
  descricao: "",
  categoriaId: "",
  centroCusto: "",
  empresa: "NORD_PIZZA",
  valor: "",
  dataCompetencia: format(new Date(), "yyyy-MM-dd"),
  dataVencimento: format(new Date(), "yyyy-MM-dd"),
  dataPagamento: "",
  bankAccountId: "",
  formaPagamento: "PIX",
  parcelado: false,
  quantidadeParcelas: "",
  parcelaAtual: "",
  observacoes: "",
  status: "EM_ABERTO",
};

export function ContasPagarClient({
  initialPayables,
  categorias,
  contas,
}: {
  initialPayables: PayableDTO[];
  categorias: { id: string; name: string; dreKey: string }[];
  contas: { id: string; name: string }[];
}) {
  const [payables, setPayables] = useState(initialPayables);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PayableDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEmpresa, setFilterEmpresa] = useState("");
  const [search, setSearch] = useState("");
  const [showRecurring, setShowRecurring] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    descricao: "",
    fornecedorCliente: "",
    categoriaId: categorias[0]?.id ?? "",
    empresa: "NORD_PIZZA",
    centroCusto: "",
    valor: "",
    diaVencimento: "10",
    bankAccountId: contas[0]?.id ?? "",
    formaPagamento: "PIX",
    infinita: true,
    quantidadeMeses: "12",
    dataInicio: format(new Date(), "yyyy-MM-dd"),
  });

  const filtered = useMemo(
    () =>
      payables
        .filter((p) => !filterStatus || p.status === filterStatus)
        .filter((p) => !filterEmpresa || p.empresa === filterEmpresa)
        .filter(
          (p) =>
            !search ||
            p.fornecedor.toLowerCase().includes(search.toLowerCase()) ||
            p.descricao.toLowerCase().includes(search.toLowerCase())
        ),
    [payables, filterStatus, filterEmpresa, search]
  );

  const totalFiltrado = filtered.reduce((a, p) => a + p.valor, 0);

  async function refresh() {
    const res = await fetch("/api/financeiro/pagar");
    const data = await res.json();
    setPayables(data.payables);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, categoriaId: categorias[0]?.id ?? "", bankAccountId: contas[0]?.id ?? "" });
    setShowForm(true);
  }

  function openEdit(p: PayableDTO) {
    setEditing(p);
    setForm({
      number: p.number,
      fornecedor: p.fornecedor,
      descricao: p.descricao,
      categoriaId: p.categoriaId,
      centroCusto: p.centroCusto ?? "",
      empresa: p.empresa,
      valor: String(p.valor),
      dataCompetencia: format(new Date(p.dataCompetencia), "yyyy-MM-dd"),
      dataVencimento: format(new Date(p.dataVencimento), "yyyy-MM-dd"),
      dataPagamento: p.dataPagamento ? format(new Date(p.dataPagamento), "yyyy-MM-dd") : "",
      bankAccountId: p.bankAccountId ?? "",
      formaPagamento: p.formaPagamento ?? "PIX",
      parcelado: p.parcelado,
      quantidadeParcelas: p.quantidadeParcelas ? String(p.quantidadeParcelas) : "",
      parcelaAtual: p.parcelaAtual ? String(p.parcelaAtual) : "",
      observacoes: p.observacoes ?? "",
      status: p.status,
    });
    setShowForm(true);
  }

  async function submit() {
    const payload = { ...form, dataPagamento: form.dataPagamento || null };
    if (editing) {
      await fetch(`/api/financeiro/pagar/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/financeiro/pagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setShowForm(false);
    refresh();
  }

  async function markPaid(p: PayableDTO) {
    await fetch(`/api/financeiro/pagar/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAGO", dataPagamento: format(new Date(), "yyyy-MM-dd") }),
    });
    refresh();
  }

  async function duplicate(p: PayableDTO) {
    await fetch("/api/financeiro/pagar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fornecedor: p.fornecedor,
        descricao: `${p.descricao} (cópia)`,
        categoriaId: p.categoriaId,
        centroCusto: p.centroCusto,
        empresa: p.empresa,
        valor: p.valor,
        dataCompetencia: p.dataCompetencia,
        dataVencimento: p.dataVencimento,
        bankAccountId: p.bankAccountId,
        formaPagamento: p.formaPagamento,
        status: "EM_ABERTO",
      }),
    });
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/financeiro/pagar/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  function exportCsv() {
    const header = ["Número", "Fornecedor", "Descrição", "Categoria", "Empresa", "Valor", "Vencimento", "Status"];
    const rows = filtered.map((p) => [
      p.number,
      p.fornecedor,
      p.descricao,
      p.categoria.name,
      p.empresa,
      p.valor,
      format(new Date(p.dataVencimento), "dd/MM/yyyy"),
      STATUS_LABEL[p.status],
    ]);
    const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contas-a-pagar.csv";
    a.click();
  }

  async function submitRecurring() {
    await fetch("/api/financeiro/recorrentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...recurringForm, tipo: "PAGAR" }),
    });
    setShowRecurring(false);
    refresh();
  }

  return (
    <Section
      title="Contas a Pagar"
      action={
        <div className="flex items-center gap-2 flex-wrap">
          <input
            placeholder="Buscar fornecedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-nord-panel border border-nord-border rounded-lg px-3 py-1.5 text-xs text-white w-40"
          />
          <select value={filterEmpresa} onChange={(e) => setFilterEmpresa(e.target.value)} className="input-sm">
            <option value="">Todas as empresas</option>
            <option value="NORD_PIZZA">Nord Pizza & Burger</option>
            <option value="ZARKI_SUSHI">Zarki Sushi</option>
            <option value="GRUPO_NORD">Grupo Nord</option>
          </select>
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
          <button onClick={() => setShowRecurring(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white">
            <Repeat size={13} /> Conta recorrente
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium">
            <Plus size={13} /> Nova conta
          </button>
        </div>
      }
    >
      <p className="text-xs text-nord-gray mb-3">
        Total filtrado: <span className="text-white font-medium">{formatCurrency(totalFiltrado)}</span> ({filtered.length} lançamentos)
      </p>
      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Nº</th>
              <th className="py-2 pr-4">Fornecedor</th>
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
                <td className="py-2 pr-4 text-white">{p.fornecedor}</td>
                <td className="py-2 pr-4 text-nord-gray">{p.categoria.name}</td>
                <td className="py-2 pr-4 text-nord-gray">{COMPANY_LABEL[p.empresa]}</td>
                <td className="py-2 pr-4 text-nord-gray">{formatCurrency(p.valor)}</td>
                <td className="py-2 pr-4 text-nord-gray">{format(new Date(p.dataVencimento), "dd/MM/yyyy")}</td>
                <td className="py-2 pr-4">
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2 justify-end">
                    {p.status !== "PAGO" && (
                      <button onClick={() => markPaid(p)} title="Marcar como pago" className="text-nord-gray hover:text-emerald-400">
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

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar conta a pagar" : "Nova conta a pagar"} widthClass="max-w-2xl">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fornecedor">
            <input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} className="input" />
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
          <Field label="Empresa">
            <select value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} className="input">
              <option value="NORD_PIZZA">Nord Pizza & Burger</option>
              <option value="ZARKI_SUSHI">Zarki Sushi</option>
              <option value="GRUPO_NORD">Grupo Nord</option>
            </select>
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
          <Field label="Data de Pagamento">
            <input type="date" value={form.dataPagamento} onChange={(e) => setForm({ ...form, dataPagamento: e.target.value })} className="input" />
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
          <Field label="Forma de Pagamento">
            <select value={form.formaPagamento} onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })} className="input">
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
        <button onClick={submit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar
        </button>
      </Modal>

      <Modal open={showRecurring} onClose={() => setShowRecurring(false)} title="Nova conta recorrente" widthClass="max-w-lg">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Descrição (ex: Aluguel, Internet, Energia, Sistema, Salários...)">
              <input value={recurringForm.descricao} onChange={(e) => setRecurringForm({ ...recurringForm, descricao: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Fornecedor">
            <input value={recurringForm.fornecedorCliente} onChange={(e) => setRecurringForm({ ...recurringForm, fornecedorCliente: e.target.value })} className="input" />
          </Field>
          <Field label="Categoria (DRE)">
            <select value={recurringForm.categoriaId} onChange={(e) => setRecurringForm({ ...recurringForm, categoriaId: e.target.value })} className="input">
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Empresa">
            <select value={recurringForm.empresa} onChange={(e) => setRecurringForm({ ...recurringForm, empresa: e.target.value })} className="input">
              <option value="NORD_PIZZA">Nord Pizza & Burger</option>
              <option value="ZARKI_SUSHI">Zarki Sushi</option>
              <option value="GRUPO_NORD">Grupo Nord</option>
            </select>
          </Field>
          <Field label="Valor (R$)">
            <input type="number" value={recurringForm.valor} onChange={(e) => setRecurringForm({ ...recurringForm, valor: e.target.value })} className="input" />
          </Field>
          <Field label="Dia do vencimento">
            <input type="number" min={1} max={28} value={recurringForm.diaVencimento} onChange={(e) => setRecurringForm({ ...recurringForm, diaVencimento: e.target.value })} className="input" />
          </Field>
          <Field label="Conta Bancária">
            <select value={recurringForm.bankAccountId} onChange={(e) => setRecurringForm({ ...recurringForm, bankAccountId: e.target.value })} className="input">
              {contas.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Data de início">
            <input type="date" value={recurringForm.dataInicio} onChange={(e) => setRecurringForm({ ...recurringForm, dataInicio: e.target.value })} className="input" />
          </Field>
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="infinita"
              checked={recurringForm.infinita}
              onChange={(e) => setRecurringForm({ ...recurringForm, infinita: e.target.checked })}
              className="accent-nord-blue"
            />
            <label htmlFor="infinita" className="text-xs text-nord-gray">
              Recorrência infinita (gera automaticamente os próximos 24 meses)
            </label>
          </div>
          {!recurringForm.infinita && (
            <Field label="Quantidade de meses">
              <input type="number" value={recurringForm.quantidadeMeses} onChange={(e) => setRecurringForm({ ...recurringForm, quantidadeMeses: e.target.value })} className="input" />
            </Field>
          )}
        </div>
        <button onClick={submitRecurring} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Criar lançamentos recorrentes
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir conta a pagar"
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
