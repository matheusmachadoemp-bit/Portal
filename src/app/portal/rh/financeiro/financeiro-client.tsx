"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Download } from "lucide-react";
import { StatCard, Section } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/calc";
import { format } from "date-fns";
import { RhTabs } from "../rh-tabs";
import { exportFinanceToPdf } from "@/lib/pdf-export";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type FinanceEntryDTO = {
  id: string;
  employeeId: string;
  date: string;
  description: string;
  type: string;
  value: number;
  observacao: string | null;
  employee: { name: string; setor: string };
};

const TYPE_LABEL: Record<string, string> = {
  SALARIO: "Salário",
  COMISSAO: "Comissão",
  BONIFICACAO: "Bonificação",
  DESCONTO: "Desconto",
  VALE_TRANSPORTE: "Vale Transporte",
  VALE_ALIMENTACAO: "Vale Alimentação",
  OUTRO: "Outro",
};

function emptyForm(employeeId: string) {
  return {
    employeeId,
    date: format(new Date(), "yyyy-MM-dd"),
    description: "",
    type: "SALARIO",
    value: "",
    observacao: "",
  };
}

function computeTotals(entries: FinanceEntryDTO[]) {
  const sumType = (type: string) => entries.filter((e) => e.type === type).reduce((s, e) => s + e.value, 0);
  const salario = sumType("SALARIO");
  const comissao = sumType("COMISSAO");
  const bonificacao = sumType("BONIFICACAO");
  const desconto = sumType("DESCONTO");
  const vt = sumType("VALE_TRANSPORTE");
  const va = sumType("VALE_ALIMENTACAO");
  const outro = sumType("OUTRO");
  const totalRecebido = salario + comissao + bonificacao + vt + va + outro - desconto;
  return { salario, comissao, bonificacao, desconto, vt, va, totalRecebido };
}

export function FinanceiroClient({
  initialEntries,
  employees,
  fixedEmployeeId,
  canCreate = true,
}: {
  initialEntries: FinanceEntryDTO[];
  employees: { id: string; name: string; setor: string }[];
  fixedEmployeeId?: string;
  canCreate?: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FinanceEntryDTO | null>(null);
  const [form, setForm] = useState(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterEmployeeId, setFilterEmployeeId] = useState("");

  const visible = useMemo(() => {
    const targetId = fixedEmployeeId ?? filterEmployeeId;
    return targetId ? entries.filter((e) => e.employeeId === targetId) : entries;
  }, [entries, fixedEmployeeId, filterEmployeeId]);

  const totals = useMemo(() => computeTotals(visible), [visible]);

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    visible
      .filter((e) => e.type !== "DESCONTO")
      .forEach((e) => {
        const key = format(new Date(e.date), "MM/yyyy");
        map.set(key, (map.get(key) ?? 0) + e.value);
      });
    return [...map.entries()]
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .map(([mes, valor]) => ({ mes, valor }));
  }, [visible]);

  async function refresh() {
    const url = fixedEmployeeId ? `/api/rh/finance?employeeId=${fixedEmployeeId}` : "/api/rh/finance";
    const res = await fetch(url);
    const data = await res.json();
    setEntries(data.entries);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
    setShowForm(true);
  }

  function openEdit(e: FinanceEntryDTO) {
    setEditing(e);
    setForm({
      employeeId: e.employeeId,
      date: format(new Date(e.date), "yyyy-MM-dd"),
      description: e.description,
      type: e.type,
      value: String(e.value),
      observacao: e.observacao ?? "",
    });
    setShowForm(true);
  }

  async function submit() {
    if (editing) {
      await fetch(`/api/rh/finance/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/rh/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setShowForm(false);
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/rh/finance/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  function handleExportPdf() {
    const employeeName = fixedEmployeeId ? employees.find((e) => e.id === fixedEmployeeId)?.name : undefined;
    exportFinanceToPdf(visible, TYPE_LABEL, {
      title: "RH - Financeiro",
      subtitle: employeeName ?? "Todos os colaboradores",
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total recebido" value={formatCurrency(totals.totalRecebido)} icon="Wallet" color="#22c55e" />
        <StatCard label="Salário" value={formatCurrency(totals.salario)} icon="DollarSign" />
        <StatCard label="Comissões" value={formatCurrency(totals.comissao)} icon="TrendingUp" />
        <StatCard label="Bonificações" value={formatCurrency(totals.bonificacao)} icon="Gift" />
        <StatCard label="Descontos" value={formatCurrency(totals.desconto)} icon="TrendingDown" color="#ef4444" />
        <StatCard label="Vale Transporte" value={formatCurrency(totals.vt)} icon="Bus" />
        <StatCard label="Vale Alimentação" value={formatCurrency(totals.va)} icon="UtensilsCrossed" />
      </div>

      {!fixedEmployeeId && (
        <div className="flex items-center justify-between">
          <RhTabs />
          <div className="flex items-center gap-2">
            {canCreate && (
              <button
                onClick={openNew}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
              >
                <Plus size={13} /> Novo lançamento
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        {!fixedEmployeeId ? (
          <select value={filterEmployeeId} onChange={(e) => setFilterEmployeeId(e.target.value)} className="input max-w-xs">
            <option value="">Todos os colaboradores</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white"
          >
            <Download size={13} /> Exportar PDF
          </button>
          {fixedEmployeeId && canCreate && (
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              <Plus size={13} /> Novo lançamento
            </button>
          )}
        </div>
      </div>

      {!canCreate && (
        <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
          lançar ou editar valores.
        </p>
      )}

      <Section title="Evolução dos recebimentos">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorRecebimentos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
            <XAxis dataKey="mes" stroke="#9a9aa2" fontSize={11} />
            <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip
              contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
              formatter={(v) => formatCurrency(Number(v))}
            />
            <Area type="monotone" dataKey="valor" name="Recebido" stroke="#22c55e" fill="url(#colorRecebimentos)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Section>

      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-3 px-4">Data</th>
              {!fixedEmployeeId && <th className="py-3 px-4">Colaborador</th>}
              <th className="py-3 px-4">Descrição</th>
              <th className="py-3 px-4">Tipo</th>
              <th className="py-3 px-4">Valor</th>
              <th className="py-3 px-4">Observação</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 px-4 text-nord-gray">{format(new Date(e.date), "dd/MM/yyyy")}</td>
                {!fixedEmployeeId && <td className="py-2.5 px-4 text-white">{e.employee.name}</td>}
                <td className="py-2.5 px-4 text-white">{e.description}</td>
                <td className="py-2.5 px-4 text-nord-gray">{TYPE_LABEL[e.type] ?? e.type}</td>
                <td className={`py-2.5 px-4 ${e.type === "DESCONTO" ? "text-red-400" : "text-emerald-400"}`}>
                  {e.type === "DESCONTO" ? "-" : ""}
                  {formatCurrency(e.value)}
                </td>
                <td className="py-2.5 px-4 text-nord-gray">{e.observacao || "-"}</td>
                <td className="py-2.5 px-4">
                  {canCreate && (
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(e)} className="text-nord-gray hover:text-white">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDeleteId(e.id)} className="text-nord-gray hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={fixedEmployeeId ? 5 : 6} className="py-8 text-center text-nord-gray text-sm">
                  Nenhum lançamento encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar lançamento" : "Novo lançamento"}>
        <div className="grid grid-cols-2 gap-3">
          {!fixedEmployeeId && (
            <div className="col-span-2">
              <Field label="Colaborador">
                <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="input">
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — {emp.setor}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <Field label="Data">
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </Field>
          <Field label="Tipo">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Descrição">
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Valor">
            <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="input" />
          </Field>
          <div className="col-span-2">
            <Field label="Observação">
              <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} className="input" />
            </Field>
          </div>
        </div>
        <button onClick={submit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir lançamento"
        message="Tem certeza que deseja excluir este lançamento?"
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
    </div>
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
