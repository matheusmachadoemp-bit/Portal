"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Download } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/calc";
import { format } from "date-fns";
import { RhTabs } from "../rh-tabs";
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

type FinanceTotals = {
  salario: number;
  comissao: number;
  bonificacao: number;
  desconto: number;
  vt: number;
  va: number;
  outro: number;
  totalRecebido: number;
};

type FinanceChartPoint = { mes: string; valor: number };

export function FinanceiroClient({
  initialEntries,
  initialTotals,
  initialChartData,
  employees,
  fixedEmployeeId,
  canCreate = true,
  isGrupoNordMode = true,
}: {
  initialEntries: FinanceEntryDTO[];
  /**
   * Task #309 revisão (Teulis): totais SEMPRE calculados no servidor via agregação no banco (ver
   * src/lib/rh-server.ts), nunca somando `entries`/`visible` aqui no cliente — essa lista tem
   * `take` (teto de segurança contra histórico sem fim), e somar uma lista cortada dá um total
   * errado (silenciosamente menor que o real) assim que o histórico passa do teto. `totals`/
   * `chartData` chegam prontos do servidor (SSR) e são atualizados a cada `refresh()` (POST/PATCH/
   * DELETE ou troca do filtro de colaborador), sempre com uma query própria sem `take`.
   */
  initialTotals: FinanceTotals;
  initialChartData: FinanceChartPoint[];
  employees: { id: string; name: string; setor: string }[];
  fixedEmployeeId?: string;
  canCreate?: boolean;
  /** Diferencia por que `canCreate` é falso: modo Grupo Nord (consolidado) ou permissão do perfil numa loja específica. */
  isGrupoNordMode?: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [totals, setTotals] = useState(initialTotals);
  const [chartData, setChartData] = useState(initialChartData);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FinanceEntryDTO | null>(null);
  const [form, setForm] = useState(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterEmployeeId, setFilterEmployeeId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Só usado pra decidir o que a TABELA mostra (lista de "atividade recente", que já tem `take` —
  // isso é esperado, nunca foi o problema). `entries` já vem do servidor filtrado por `targetId`
  // (ver `refresh` abaixo), então este `.filter()` é normalmente um no-op — fica só como estado de
  // carregamento (evita mostrar a lista errada por 1 instante enquanto o fetch do novo filtro ainda
  // não voltou).
  const visible = useMemo(() => {
    const targetId = fixedEmployeeId ?? filterEmployeeId;
    return targetId ? entries.filter((e) => e.employeeId === targetId) : entries;
  }, [entries, fixedEmployeeId, filterEmployeeId]);

  // Sequência da última chamada de `refresh()` disparada — protege contra resposta fora de ordem
  // (ex.: usuário troca o filtro de colaborador rápido demais e a resposta do fetch ANTERIOR chega
  // DEPOIS da mais recente, sobrescrevendo o dado certo com o do colaborador errado por um
  // instante). Mesmo racional do `cancelled` usado no efeito de "Histórico do colaborador" em
  // ocorrencias-client.tsx, adaptado pra uma função chamada de vários lugares (troca de filtro,
  // submit, delete) em vez de um único useEffect.
  const refreshSeqRef = useRef(0);

  async function refresh(targetIdOverride?: string) {
    // Task #309 revisão (Teulis) — "segundo sintoma": antes, trocar o filtro de colaborador
    // (`filterEmployeeId`) só rodava um `.filter()` no cliente sobre a lista já cortada pelo
    // `take` da loja inteira — um colaborador cujos lançamentos antigos tinham saído do corte
    // aparecia com ZERO lançamentos aqui, enquanto a ficha dele (que busca com `employeeId` de
    // verdade, teto individual bem maior na prática) mostrava o histórico certo. Agora trocar o
    // filtro dispara este mesmo `refresh()` com o novo id, buscando de verdade com `?employeeId=`
    // — mesma rota, mesmo teto individual usado pela ficha, então as duas telas concordam.
    const targetId = fixedEmployeeId ?? targetIdOverride ?? filterEmployeeId;
    const url = targetId ? `/api/rh/finance?employeeId=${targetId}` : "/api/rh/finance";
    const seq = ++refreshSeqRef.current;
    const res = await fetch(url);
    const data = await res.json();
    if (seq !== refreshSeqRef.current) return; // uma chamada mais nova já foi disparada — descarta esta resposta atrasada
    setEntries(data.entries);
    setTotals(data.totals);
    setChartData(data.chartData);
  }

  function handleFilterChange(id: string) {
    setFilterEmployeeId(id);
    refresh(id);
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
    if (submitting) return;
    setSubmitting(true);
    try {
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
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/rh/finance/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  async function handleExportPdf() {
    const employeeName = fixedEmployeeId ? employees.find((e) => e.id === fixedEmployeeId)?.name : undefined;
    const { exportFinanceToPdf } = await import("@/lib/pdf-export");
    exportFinanceToPdf(visible, TYPE_LABEL, {
      title: "RH - Financeiro",
      subtitle: employeeName ?? "Todos os colaboradores",
    });
  }

  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="rh-financeiro-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "total-recebido", label: "Total recebido", value: formatCurrency(totals.totalRecebido), icon: "Wallet", color: "#22c55e" },
          { key: "salario", label: "Salário", value: formatCurrency(totals.salario), icon: "DollarSign" },
          { key: "comissoes", label: "Comissões", value: formatCurrency(totals.comissao), icon: "TrendingUp" },
          { key: "bonificacoes", label: "Bonificações", value: formatCurrency(totals.bonificacao), icon: "Gift" },
          { key: "descontos", label: "Descontos", value: formatCurrency(totals.desconto), icon: "TrendingDown", color: "#ef4444" },
          { key: "vale-transporte", label: "Vale Transporte", value: formatCurrency(totals.vt), icon: "Bus" },
          { key: "vale-alimentacao", label: "Vale Alimentação", value: formatCurrency(totals.va), icon: "UtensilsCrossed" },
        ]}
      />

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
          <select value={filterEmployeeId} onChange={(e) => handleFilterChange(e.target.value)} className="input max-w-xs">
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
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          {isGrupoNordMode
            ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para lançar ou editar valores."
            : "Seu perfil de permissão não permite lançar ou editar valores neste módulo."}
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
                <td className={`py-2.5 px-4 ${e.type === "DESCONTO" ? "text-nord-danger" : "text-nord-success"}`}>
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
                      <button onClick={() => setConfirmDeleteId(e.id)} className="text-nord-gray hover:text-nord-danger">
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
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg py-2.5"
        >
          {submitting ? "Salvando..." : "Salvar"}
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
