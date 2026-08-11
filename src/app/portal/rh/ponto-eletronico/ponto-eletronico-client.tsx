"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Upload, AlertTriangle } from "lucide-react";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatNumber } from "@/lib/calc";
import { pontoAlerts, type TimeEntryLike } from "@/lib/rh-helpers";
import { format } from "date-fns";
import { RhTabs } from "../rh-tabs";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type TimeEntryDTO = TimeEntryLike & {
  id: string;
  employeeId: string;
  saidaAlmoco: string | null;
  retornoAlmoco: string | null;
  employee: { name: string; setor: string };
};

function emptyForm(employeeId: string) {
  return {
    employeeId,
    date: format(new Date(), "yyyy-MM-dd"),
    entrada: "",
    saidaAlmoco: "",
    retornoAlmoco: "",
    saida: "",
    atrasoMinutos: "",
    falta: false,
  };
}

export function PontoEletronicoClient({
  initialEntries,
  employees,
  fixedEmployeeId,
  canCreate = true,
}: {
  initialEntries: TimeEntryDTO[];
  employees: { id: string; name: string; setor: string }[];
  fixedEmployeeId?: string;
  canCreate?: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TimeEntryDTO | null>(null);
  const [form, setForm] = useState(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    return fixedEmployeeId ? entries.filter((e) => e.employeeId === fixedEmployeeId) : entries;
  }, [entries, fixedEmployeeId]);

  const alerts = useMemo(() => pontoAlerts(visible), [visible]);

  const totals = useMemo(() => {
    const horas = visible.reduce((s, e) => s + e.horasTrabalhadas, 0);
    const atrasos = visible.filter((e) => e.atrasoMinutos > 0).length;
    const faltas = visible.filter((e) => e.falta).length;
    const bancoMinutos = visible.reduce((s, e) => s + (e.horasTrabalhadas - 8) * 60, 0);
    return { horas, atrasos, faltas, bancoMinutos };
  }, [visible]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, { horas: number; atrasos: number; faltas: number; banco: number }>();
    [...visible]
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .forEach((e) => {
        const key = format(new Date(e.date), "MM/yyyy");
        const cur = map.get(key) ?? { horas: 0, atrasos: 0, faltas: 0, banco: 0 };
        cur.horas += e.horasTrabalhadas;
        if (e.atrasoMinutos > 0) cur.atrasos += 1;
        if (e.falta) cur.faltas += 1;
        cur.banco += (e.horasTrabalhadas - 8) * 60;
        map.set(key, cur);
      });
    let cumulativeBanco = 0;
    return [...map.entries()].map(([mes, v]) => {
      cumulativeBanco += v.banco;
      return { mes, horas: Math.round(v.horas * 10) / 10, atrasos: v.atrasos, faltas: v.faltas, banco: Math.round(cumulativeBanco / 60) };
    });
  }, [visible]);

  async function refresh() {
    const url = fixedEmployeeId ? `/api/rh/time-entries?employeeId=${fixedEmployeeId}` : "/api/rh/time-entries";
    const res = await fetch(url);
    const data = await res.json();
    setEntries(data.entries);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
    setShowForm(true);
  }

  function openEdit(e: TimeEntryDTO) {
    setEditing(e);
    setForm({
      employeeId: e.employeeId,
      date: format(new Date(e.date), "yyyy-MM-dd"),
      entrada: e.entrada ?? "",
      saidaAlmoco: e.saidaAlmoco ?? "",
      retornoAlmoco: e.retornoAlmoco ?? "",
      saida: e.saida ?? "",
      atrasoMinutos: String(e.atrasoMinutos),
      falta: e.falta,
    });
    setShowForm(true);
  }

  async function submit() {
    if (editing) {
      await fetch(`/api/rh/time-entries/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/rh/time-entries", {
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
    await fetch(`/api/rh/time-entries/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append("file", file);
    if (fixedEmployeeId) formData.append("employeeId", fixedEmployeeId);
    try {
      const res = await fetch("/api/rh/time-entries/import", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        refresh();
      } else {
        setImportResult({ imported: 0, errors: [data.error ?? "Erro ao importar."] });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Horas trabalhadas" value={`${formatNumber(totals.horas, 1)}h`} icon="Clock" />
        <StatCard label="Atrasos" value={formatNumber(totals.atrasos)} icon="AlarmClockOff" color="#eab308" />
        <StatCard label="Faltas" value={formatNumber(totals.faltas)} icon="UserX" color="#ef4444" />
        <StatCard
          label="Banco de horas"
          value={`${totals.bancoMinutos >= 0 ? "+" : ""}${Math.round(totals.bancoMinutos / 60)}h`}
          icon="Hourglass"
          color={totals.bancoMinutos < 0 ? "#ef4444" : "#22c55e"}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        {!fixedEmployeeId ? <RhTabs /> : <div />}
        {canCreate && (
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx" className="hidden" id="ponto-upload" onChange={handleFileChange} />
            <label
              htmlFor="ponto-upload"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white cursor-pointer"
            >
              <Upload size={13} /> {uploading ? "Enviando..." : "Enviar Arquivo"}
            </label>
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              <Plus size={13} /> Novo registro
            </button>
          </div>
        )}
      </div>
      {!canCreate && (
        <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
          registrar ou importar o ponto.
        </p>
      )}

      {importResult && (
        <div
          className={`text-xs rounded-lg px-3 py-2 border ${
            importResult.errors.length > 0
              ? "bg-amber-950/20 border-amber-900/40 text-amber-400"
              : "bg-emerald-950/20 border-emerald-900/40 text-emerald-400"
          }`}
        >
          <p>{importResult.imported} registro(s) importado(s).</p>
          {importResult.errors.slice(0, 5).map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}

      {alerts.length > 0 && (
        <Section title="Alertas automáticos">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Horas trabalhadas por mês">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="mes" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Bar dataKey="horas" name="Horas" fill="#2952E3" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Atrasos e faltas por mês">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="mes" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Bar dataKey="atrasos" name="Atrasos" fill="#eab308" radius={[6, 6, 0, 0]} />
              <Bar dataKey="faltas" name="Faltas" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
        <div className="md:col-span-2">
          <Section title="Banco de horas acumulado">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                <XAxis dataKey="mes" stroke="#9a9aa2" fontSize={11} />
                <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v}h`} />
                <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} formatter={(v) => `${v}h`} />
                <Line type="monotone" dataKey="banco" name="Banco de horas" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Section>
        </div>
      </div>

      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-3 px-4">Data</th>
              {!fixedEmployeeId && <th className="py-3 px-4">Colaborador</th>}
              <th className="py-3 px-4">Entrada</th>
              <th className="py-3 px-4">Saída almoço</th>
              <th className="py-3 px-4">Retorno</th>
              <th className="py-3 px-4">Saída</th>
              <th className="py-3 px-4">Horas trabalhadas</th>
              <th className="py-3 px-4">Atraso</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 px-4 text-white">{format(new Date(e.date), "dd/MM/yyyy")}</td>
                {!fixedEmployeeId && <td className="py-2.5 px-4 text-nord-gray">{e.employee.name}</td>}
                <td className="py-2.5 px-4 text-nord-gray">{e.entrada || "-"}</td>
                <td className="py-2.5 px-4 text-nord-gray">{e.saidaAlmoco || "-"}</td>
                <td className="py-2.5 px-4 text-nord-gray">{e.retornoAlmoco || "-"}</td>
                <td className="py-2.5 px-4 text-nord-gray">{e.saida || "-"}</td>
                <td className="py-2.5 px-4 text-white">{e.falta ? <Badge tone="danger">Falta</Badge> : `${e.horasTrabalhadas.toFixed(1)}h`}</td>
                <td className="py-2.5 px-4">
                  {e.atrasoMinutos > 0 ? <Badge tone="warning">{e.atrasoMinutos}min</Badge> : <span className="text-nord-gray">-</span>}
                </td>
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
                <td colSpan={fixedEmployeeId ? 8 : 9} className="py-8 text-center text-nord-gray text-sm">
                  Nenhum registro de ponto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar registro" : "Novo registro"}>
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
          <Field label="Minutos de atraso">
            <input type="number" value={form.atrasoMinutos} onChange={(e) => setForm({ ...form, atrasoMinutos: e.target.value })} className="input" />
          </Field>
          <Field label="Entrada">
            <input value={form.entrada} onChange={(e) => setForm({ ...form, entrada: e.target.value })} className="input" placeholder="08:00" />
          </Field>
          <Field label="Saída almoço">
            <input value={form.saidaAlmoco} onChange={(e) => setForm({ ...form, saidaAlmoco: e.target.value })} className="input" placeholder="12:00" />
          </Field>
          <Field label="Retorno almoço">
            <input value={form.retornoAlmoco} onChange={(e) => setForm({ ...form, retornoAlmoco: e.target.value })} className="input" placeholder="13:00" />
          </Field>
          <Field label="Saída">
            <input value={form.saida} onChange={(e) => setForm({ ...form, saida: e.target.value })} className="input" placeholder="18:00" />
          </Field>
          <label className="flex items-center gap-2 col-span-2 text-sm text-nord-gray">
            <input type="checkbox" checked={form.falta} onChange={(e) => setForm({ ...form, falta: e.target.checked })} />
            Marcar como falta
          </label>
        </div>
        <button onClick={submit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir registro"
        message="Tem certeza que deseja excluir este registro de ponto?"
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
