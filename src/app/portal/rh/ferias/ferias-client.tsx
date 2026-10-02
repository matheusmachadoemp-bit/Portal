"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";
import { formatNumber } from "@/lib/calc";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  isWithinInterval,
  isSameMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { RhTabs } from "../rh-tabs";

/** Quantos meses (a partir do mês atual) o calendário mostra de cada vez antes de precisar
 * clicar em "Mostrar mais meses" — ver 3 ao mesmo tempo é o que cabe confortavelmente numa
 * tela comum sem rolar; meses extras ficam disponíveis rolando a fileira horizontalmente,
 * igual as colunas do kanban de Marketing. */
const INITIAL_MONTHS = 6;
const MONTHS_STEP = 3;
const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

type VacationDTO = {
  id: string;
  employeeId: string;
  periodoAquisitivoInicio: string;
  periodoAquisitivoFim: string;
  diasDireito: number;
  dataInicio: string | null;
  dataFim: string | null;
  dias: number | null;
  status: string;
  observacao: string | null;
  employee: { name: string; setor: string };
};

const STATUS_LABEL: Record<string, string> = {
  PLANEJADA: "Planejada",
  APROVADA: "Aprovada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PLANEJADA: "warning",
  APROVADA: "info",
  EM_ANDAMENTO: "info",
  CONCLUIDA: "success",
  CANCELADA: "danger",
};

function emptyForm(employeeId: string) {
  const now = new Date();
  return {
    employeeId,
    periodoAquisitivoInicio: format(now, "yyyy-MM-dd"),
    periodoAquisitivoFim: format(addMonths(now, 12), "yyyy-MM-dd"),
    diasDireito: "30",
    dataInicio: "",
    dataFim: "",
    dias: "",
    status: "PLANEJADA",
    observacao: "",
  };
}

export function FeriasClient({
  initialVacations,
  employees,
  fixedEmployeeId,
  canCreate = true,
  isGrupoNordMode = true,
}: {
  initialVacations: VacationDTO[];
  employees: { id: string; name: string; setor: string }[];
  fixedEmployeeId?: string;
  canCreate?: boolean;
  /** Diferencia por que `canCreate` é falso: modo Grupo Nord (consolidado) ou permissão do perfil numa loja específica. */
  isGrupoNordMode?: boolean;
}) {
  const [vacations, setVacations] = useState(initialVacations);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VacationDTO | null>(null);
  const [form, setForm] = useState(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [monthsToShow, setMonthsToShow] = useState(INITIAL_MONTHS);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const visible = useMemo(() => {
    return fixedEmployeeId ? vacations.filter((v) => v.employeeId === fixedEmployeeId) : vacations;
  }, [vacations, fixedEmployeeId]);

  const totals = useMemo(() => {
    const periodos = visible.length;
    const diasDisponiveis = visible
      .filter((v) => v.status !== "CANCELADA")
      .reduce((s, v) => s + (v.diasDireito - (v.dias ?? 0)), 0);
    const diasTirados = visible.filter((v) => v.status === "CONCLUIDA").reduce((s, v) => s + (v.dias ?? 0), 0);
    const vencidas = visible.filter((v) => {
      if (v.status === "CONCLUIDA" || v.status === "CANCELADA") return false;
      return new Date(v.periodoAquisitivoFim) < new Date();
    }).length;
    return { periodos, diasDisponiveis, diasTirados, vencidas };
  }, [visible]);

  function vacationsOnDay(day: Date) {
    return visible.filter((v) => {
      if (!v.dataInicio || !v.dataFim) return false;
      if (v.status !== "APROVADA" && v.status !== "EM_ANDAMENTO") return false;
      return isWithinInterval(day, { start: new Date(v.dataInicio), end: new Date(v.dataFim) });
    });
  }

  // Um cartão por mês, começando no mês atual — em vez do antigo "um mês só com setas",
  // a fileira inteira fica montada e rola na horizontal (igual as colunas do kanban de
  // Marketing), então os meses anteriores nunca saem da tela de vez, só ficam fora da
  // área visível até o usuário rolar de volta pra eles.
  const months = useMemo(() => {
    const base = startOfMonth(new Date());
    return Array.from({ length: monthsToShow }, (_, i) => addMonths(base, i));
  }, [monthsToShow]);

  const monthCards = useMemo(() => {
    return months.map((month) => {
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const days = eachDayOfInterval({ start, end });
      const leadingBlanks = getDay(start);
      const employeesInMonth = new Set<string>();
      visible.forEach((v) => {
        if (!v.dataInicio || !v.dataFim) return;
        if (v.status !== "APROVADA" && v.status !== "EM_ANDAMENTO") return;
        const vStart = new Date(v.dataInicio);
        const vEnd = new Date(v.dataFim);
        if (vStart <= end && vEnd >= start) employeesInMonth.add(v.employeeId);
      });
      return { month, days, leadingBlanks, employeeCount: employeesInMonth.size };
    });
  }, [months, visible]);

  async function refresh() {
    const url = fixedEmployeeId ? `/api/rh/vacations?employeeId=${fixedEmployeeId}` : "/api/rh/vacations";
    const res = await fetch(url);
    const data = await res.json();
    setVacations(data.vacations);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(v: VacationDTO) {
    setEditing(v);
    setFormError(null);
    setForm({
      employeeId: v.employeeId,
      periodoAquisitivoInicio: format(new Date(v.periodoAquisitivoInicio), "yyyy-MM-dd"),
      periodoAquisitivoFim: format(new Date(v.periodoAquisitivoFim), "yyyy-MM-dd"),
      diasDireito: String(v.diasDireito),
      dataInicio: v.dataInicio ? format(new Date(v.dataInicio), "yyyy-MM-dd") : "",
      dataFim: v.dataFim ? format(new Date(v.dataFim), "yyyy-MM-dd") : "",
      dias: v.dias !== null ? String(v.dias) : "",
      status: v.status,
      observacao: v.observacao ?? "",
    });
    setShowForm(true);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = editing
        ? await apiRequest(`/api/rh/vacations/${editing.id}`, "PATCH", form)
        : await apiRequest("/api/rh/vacations", "POST", form);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setShowForm(false);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    const result = await apiRequest(`/api/rh/vacations/${confirmDeleteId}`, "DELETE");
    if (!result.ok) {
      setRowError(result.error);
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="rh-ferias-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "periodos-aquisitivos", label: "Períodos aquisitivos", value: formatNumber(totals.periodos), icon: "CalendarRange" },
          { key: "dias-disponiveis", label: "Dias disponíveis", value: formatNumber(totals.diasDisponiveis), icon: "Palmtree", color: "#22c55e" },
          { key: "ferias-tiradas", label: "Férias tiradas", value: formatNumber(totals.diasTirados), icon: "CheckCircle2" },
          { key: "ferias-vencidas", label: "Férias vencidas", value: formatNumber(totals.vencidas), icon: "AlertTriangle", color: "#ef4444" },
        ]}
      />

      <div className="flex items-center justify-between">
        {!fixedEmployeeId ? <RhTabs /> : <div />}
        {canCreate && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Solicitar férias
          </button>
        )}
      </div>
      {!canCreate && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          {isGrupoNordMode
            ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para solicitar ou editar férias."
            : "Seu perfil de permissão não permite solicitar ou editar férias neste módulo."}
        </p>
      )}

      <FormError message={rowError} />
      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              {!fixedEmployeeId && <th className="py-3 px-4">Colaborador</th>}
              <th className="py-3 px-4">Período aquisitivo</th>
              <th className="py-3 px-4">Dias</th>
              <th className="py-3 px-4">Início</th>
              <th className="py-3 px-4">Término</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((v) => (
              <tr key={v.id} className="border-b border-nord-border/50 hover:bg-white/5">
                {!fixedEmployeeId && <td className="py-2.5 px-4 text-white">{v.employee.name}</td>}
                <td className="py-2.5 px-4 text-nord-gray">
                  {format(new Date(v.periodoAquisitivoInicio), "dd/MM/yyyy")} – {format(new Date(v.periodoAquisitivoFim), "dd/MM/yyyy")}
                </td>
                <td className="py-2.5 px-4 text-nord-gray">{v.dias ?? v.diasDireito}</td>
                <td className="py-2.5 px-4 text-nord-gray">{v.dataInicio ? format(new Date(v.dataInicio), "dd/MM/yyyy") : "-"}</td>
                <td className="py-2.5 px-4 text-nord-gray">{v.dataFim ? format(new Date(v.dataFim), "dd/MM/yyyy") : "-"}</td>
                <td className="py-2.5 px-4">
                  <Badge tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status] ?? v.status}</Badge>
                </td>
                <td className="py-2.5 px-4">
                  {canCreate && (
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(v)} className="text-nord-gray hover:text-white">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDeleteId(v.id)} className="text-nord-gray hover:text-nord-danger">
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
                  Nenhum período de férias registrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Section
        title="Calendário"
        action={
          <button
            onClick={() => setMonthsToShow((n) => n + MONTHS_STEP)}
            className="flex items-center gap-1 text-xs text-nord-gray hover:text-white"
          >
            Mostrar mais meses <ChevronRight size={14} />
          </button>
        }
      >
        <div className="flex gap-3 overflow-x-auto nord-scrollbar pb-2 snap-x snap-mandatory">
          {monthCards.map(({ month, days, leadingBlanks, employeeCount }) => {
            const isCurrentMonth = isSameMonth(month, new Date());
            return (
              <div
                key={month.toISOString()}
                className={`w-72 sm:w-80 shrink-0 snap-start rounded-xl border p-3 ${
                  isCurrentMonth ? "border-nord-blue bg-nord-blue/5" : "border-nord-border bg-nord-panel/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-sm font-medium text-white capitalize truncate">
                    {format(month, "MMMM yyyy", { locale: ptBR })}
                  </span>
                  {employeeCount > 0 && (
                    <span className="shrink-0 text-[11px] font-medium text-nord-blue-light bg-nord-blue/15 rounded-full px-2 py-0.5">
                      {employeeCount} {employeeCount === 1 ? "colaborador" : "colaboradores"}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-nord-gray mb-2">
                  {WEEKDAY_LABELS.map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: leadingBlanks }).map((_, i) => (
                    <div key={`blank-${i}`} />
                  ))}
                  {days.map((day) => {
                    const dayVacations = vacationsOnDay(day);
                    const onVacation = dayVacations.length > 0;
                    return (
                      <div
                        key={day.toISOString()}
                        className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs ${
                          onVacation ? "bg-nord-blue/20 text-nord-blue-light font-medium" : "text-nord-gray"
                        }`}
                        title={dayVacations.map((v) => v.employee.name).join(", ")}
                      >
                        <span>{format(day, "d")}</span>
                        {onVacation && <span className="w-1 h-1 rounded-full bg-nord-blue-light" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar período de férias" : "Solicitar férias"}>
        <FormError message={formError} />
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
          <Field label="Início do período aquisitivo">
            <input type="date" value={form.periodoAquisitivoInicio} onChange={(e) => setForm({ ...form, periodoAquisitivoInicio: e.target.value })} className="input" />
          </Field>
          <Field label="Fim do período aquisitivo">
            <input type="date" value={form.periodoAquisitivoFim} onChange={(e) => setForm({ ...form, periodoAquisitivoFim: e.target.value })} className="input" />
          </Field>
          <Field label="Dias de direito">
            <input type="number" value={form.diasDireito} onChange={(e) => setForm({ ...form, diasDireito: e.target.value })} className="input" />
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
          <Field label="Data início do gozo">
            <input type="date" value={form.dataInicio} onChange={(e) => setForm({ ...form, dataInicio: e.target.value })} className="input" />
          </Field>
          <Field label="Data término do gozo">
            <input type="date" value={form.dataFim} onChange={(e) => setForm({ ...form, dataFim: e.target.value })} className="input" />
          </Field>
          <Field label="Dias tirados">
            <input type="number" value={form.dias} onChange={(e) => setForm({ ...form, dias: e.target.value })} className="input" />
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
        title="Excluir período"
        message="Tem certeza que deseja excluir este período de férias?"
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
