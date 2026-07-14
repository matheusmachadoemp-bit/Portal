"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatNumber } from "@/lib/calc";
import { format } from "date-fns";

type OccurrenceDTO = {
  id: string;
  employeeId: string;
  date: string;
  type: string;
  horarioPrevisto: string | null;
  horarioRealizado: string | null;
  minutosAtraso: number;
  justificativa: string | null;
  anexoUrl: string | null;
  observacao: string | null;
  status: string;
  employee: { id: string; name: string; setor: string };
};

const TYPE_LABEL: Record<string, string> = { FALTA: "Falta", ATRASO: "Atraso", ATESTADO: "Atestado" };
const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger"> = {
  PENDENTE: "warning",
  JUSTIFICADA: "success",
  NAO_JUSTIFICADA: "danger",
};

const emptyForm = {
  employeeId: "",
  date: format(new Date(), "yyyy-MM-dd"),
  type: "FALTA",
  horarioPrevisto: "",
  horarioRealizado: "",
  minutosAtraso: "",
  justificativa: "",
  anexoUrl: "",
  observacao: "",
  status: "PENDENTE",
};

export function OcorrenciasClient({
  initialOccurrences,
  employees,
}: {
  initialOccurrences: OccurrenceDTO[];
  employees: { id: string; name: string; setor: string }[];
}) {
  const [occurrences, setOccurrences] = useState(initialOccurrences);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OccurrenceDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const faltas = occurrences.filter((o) => o.type === "FALTA").length;
  const atrasos = occurrences.filter((o) => o.type === "ATRASO").length;
  const atestados = occurrences.filter((o) => o.type === "ATESTADO").length;

  const rankingAtrasos = useMemo(() => {
    const map = new Map<string, number>();
    occurrences.filter((o) => o.type === "ATRASO").forEach((o) => {
      map.set(o.employee.name, (map.get(o.employee.name) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [occurrences]);

  const rankingFaltas = useMemo(() => {
    const map = new Map<string, number>();
    occurrences.filter((o) => o.type === "FALTA").forEach((o) => {
      map.set(o.employee.name, (map.get(o.employee.name) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [occurrences]);

  async function refresh() {
    const res = await fetch("/api/rh/occurrences");
    const data = await res.json();
    setOccurrences(data.occurrences);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, employeeId: employees[0]?.id ?? "" });
    setShowForm(true);
  }

  function openEdit(o: OccurrenceDTO) {
    setEditing(o);
    setForm({
      employeeId: o.employeeId,
      date: format(new Date(o.date), "yyyy-MM-dd"),
      type: o.type,
      horarioPrevisto: o.horarioPrevisto ?? "",
      horarioRealizado: o.horarioRealizado ?? "",
      minutosAtraso: String(o.minutosAtraso),
      justificativa: o.justificativa ?? "",
      anexoUrl: o.anexoUrl ?? "",
      observacao: o.observacao ?? "",
      status: o.status,
    });
    setShowForm(true);
  }

  async function submit() {
    if (editing) {
      await fetch(`/api/rh/occurrences/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/rh/occurrences", {
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
    await fetch(`/api/rh/occurrences/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Faltas" value={formatNumber(faltas)} icon="UserX" color="#ef4444" />
        <StatCard label="Atrasos" value={formatNumber(atrasos)} icon="Clock" color="#eab308" />
        <StatCard label="Atestados" value={formatNumber(atestados)} icon="FileText" color="#2952E3" />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Link href="/portal/rh/colaboradores" className="px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white">
            Colaboradores
          </Link>
          <Link href="/portal/rh/ocorrencias" className="px-3 py-1.5 rounded-lg text-xs bg-nord-blue text-white">
            Ocorrências
          </Link>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
        >
          <Plus size={13} /> Nova ocorrência
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Ranking de atrasos">
          <ul className="space-y-2">
            {rankingAtrasos.map(([name, count], i) => (
              <li key={name} className="flex items-center justify-between text-sm">
                <span className="text-nord-gray">
                  {i + 1}. {name}
                </span>
                <Badge tone="warning">{count}x</Badge>
              </li>
            ))}
            {rankingAtrasos.length === 0 && <p className="text-sm text-nord-gray">Sem registros.</p>}
          </ul>
        </Section>
        <Section title="Ranking de faltas">
          <ul className="space-y-2">
            {rankingFaltas.map(([name, count], i) => (
              <li key={name} className="flex items-center justify-between text-sm">
                <span className="text-nord-gray">
                  {i + 1}. {name}
                </span>
                <Badge tone="danger">{count}x</Badge>
              </li>
            ))}
            {rankingFaltas.length === 0 && <p className="text-sm text-nord-gray">Sem registros.</p>}
          </ul>
        </Section>
      </div>

      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-3 px-4">Colaborador</th>
              <th className="py-3 px-4">Data</th>
              <th className="py-3 px-4">Tipo</th>
              <th className="py-3 px-4">Minutos atraso</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {occurrences.map((o) => (
              <tr key={o.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 px-4 text-white">{o.employee.name}</td>
                <td className="py-2.5 px-4 text-nord-gray">{format(new Date(o.date), "dd/MM/yyyy")}</td>
                <td className="py-2.5 px-4 text-nord-gray">{TYPE_LABEL[o.type]}</td>
                <td className="py-2.5 px-4 text-nord-gray">{o.minutosAtraso || "-"}</td>
                <td className="py-2.5 px-4">
                  <Badge tone={STATUS_TONE[o.status]}>{o.status.replaceAll("_", " ")}</Badge>
                </td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(o)} className="text-nord-gray hover:text-white">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDeleteId(o.id)} className="text-nord-gray hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar ocorrência" : "Nova ocorrência"}>
        <div className="grid grid-cols-2 gap-3">
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
          <Field label="Data">
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </Field>
          <Field label="Tipo de ocorrência">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
              <option value="FALTA">Falta</option>
              <option value="ATRASO">Atraso</option>
              <option value="ATESTADO">Atestado</option>
            </select>
          </Field>
          <Field label="Horário previsto">
            <input value={form.horarioPrevisto} onChange={(e) => setForm({ ...form, horarioPrevisto: e.target.value })} className="input" placeholder="08:00" />
          </Field>
          <Field label="Horário realizado">
            <input value={form.horarioRealizado} onChange={(e) => setForm({ ...form, horarioRealizado: e.target.value })} className="input" placeholder="08:20" />
          </Field>
          <Field label="Minutos de atraso">
            <input type="number" value={form.minutosAtraso} onChange={(e) => setForm({ ...form, minutosAtraso: e.target.value })} className="input" />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
              <option value="PENDENTE">Pendente</option>
              <option value="JUSTIFICADA">Justificada</option>
              <option value="NAO_JUSTIFICADA">Não justificada</option>
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Justificativa">
              <input value={form.justificativa} onChange={(e) => setForm({ ...form, justificativa: e.target.value })} className="input" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Anexo (URL)">
              <input value={form.anexoUrl} onChange={(e) => setForm({ ...form, anexoUrl: e.target.value })} className="input" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Observação">
              <textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} className="input min-h-14" />
            </Field>
          </div>
        </div>
        <button onClick={submit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir ocorrência"
        message="Tem certeza que deseja excluir esta ocorrência?"
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
