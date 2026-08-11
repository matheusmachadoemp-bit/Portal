"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatNumber } from "@/lib/calc";
import { feriasAlerts } from "@/lib/rh-helpers";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isWithinInterval,
  isSameMonth,
} from "date-fns";
import { RhTabs } from "../rh-tabs";

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
}: {
  initialVacations: VacationDTO[];
  employees: { id: string; name: string; setor: string }[];
  fixedEmployeeId?: string;
  canCreate?: boolean;
}) {
  const [vacations, setVacations] = useState(initialVacations);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VacationDTO | null>(null);
  const [form, setForm] = useState(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const visible = useMemo(() => {
    return fixedEmployeeId ? vacations.filter((v) => v.employeeId === fixedEmployeeId) : vacations;
  }, [vacations, fixedEmployeeId]);

  const alerts = useMemo(() => feriasAlerts(visible), [visible]);

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

  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    const days = eachDayOfInterval({ start, end });
    const leadingBlanks = getDay(start);
    return { days, leadingBlanks };
  }, [calendarMonth]);

  function vacationsOnDay(day: Date) {
    return visible.filter((v) => {
      if (!v.dataInicio || !v.dataFim) return false;
      if (v.status !== "APROVADA" && v.status !== "EM_ANDAMENTO") return false;
      return isWithinInterval(day, { start: new Date(v.dataInicio), end: new Date(v.dataFim) });
    });
  }

  async function refresh() {
    const url = fixedEmployeeId ? `/api/rh/vacations?employeeId=${fixedEmployeeId}` : "/api/rh/vacations";
    const res = await fetch(url);
    const data = await res.json();
    setVacations(data.vacations);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
    setShowForm(true);
  }

  function openEdit(v: VacationDTO) {
    setEditing(v);
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
    if (editing) {
      await fetch(`/api/rh/vacations/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/rh/vacations", {
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
    await fetch(`/api/rh/vacations/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Períodos aquisitivos" value={formatNumber(totals.periodos)} icon="CalendarRange" />
        <StatCard label="Dias disponíveis" value={formatNumber(totals.diasDisponiveis)} icon="Palmtree" color="#22c55e" />
        <StatCard label="Férias tiradas" value={formatNumber(totals.diasTirados)} icon="CheckCircle2" />
        <StatCard label="Férias vencidas" value={formatNumber(totals.vencidas)} icon="AlertTriangle" color="#ef4444" />
      </div>

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
        <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
          solicitar ou editar férias.
        </p>
      )}

      {alerts.length > 0 && (
        <Section title="Alertas">
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-400">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Calendário"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => setCalendarMonth((m) => subMonths(m, 1))} className="text-nord-gray hover:text-white">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-white w-24 text-center">{format(calendarMonth, "MMMM yyyy")}</span>
            <button onClick={() => setCalendarMonth((m) => addMonths(m, 1))} className="text-nord-gray hover:text-white">
              <ChevronRight size={16} />
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-nord-gray mb-2">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: calendarDays.leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {calendarDays.days.map((day) => {
            const dayVacations = vacationsOnDay(day);
            return (
              <div
                key={day.toISOString()}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs ${
                  dayVacations.length > 0
                    ? "bg-nord-blue/20 text-nord-blue-light font-medium"
                    : isSameMonth(day, calendarMonth)
                      ? "text-nord-gray"
                      : "text-nord-gray/30"
                }`}
                title={dayVacations.map((v) => v.employee.name).join(", ")}
              >
                {format(day, "d")}
              </div>
            );
          })}
        </div>
      </Section>

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
                      <button onClick={() => setConfirmDeleteId(v.id)} className="text-nord-gray hover:text-red-400">
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

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar período de férias" : "Solicitar férias"}>
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
        <button onClick={submit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar
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
