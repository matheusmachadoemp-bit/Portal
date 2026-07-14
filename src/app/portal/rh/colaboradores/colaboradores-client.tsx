"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { StatCard, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatNumber, formatPercent } from "@/lib/calc";
import { format } from "date-fns";

type EmployeeDTO = {
  id: string;
  name: string;
  cargo: string;
  setor: string;
  admissionDate: string;
  terminationDate: string | null;
  status: string;
  phone: string | null;
  email: string | null;
  gestorResponsavel: string | null;
};

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  ATIVO: "success",
  FERIAS: "info",
  AFASTADO: "warning",
  DESLIGADO: "danger",
};

const emptyForm = {
  name: "",
  cargo: "",
  setor: "",
  admissionDate: format(new Date(), "yyyy-MM-dd"),
  status: "ATIVO",
  phone: "",
  email: "",
  gestorResponsavel: "",
};

export function ColaboradoresClient({
  initialEmployees,
  turnover,
  desligamentos,
  quadroMedio,
  totalOcorrencias,
}: {
  initialEmployees: EmployeeDTO[];
  turnover: number;
  desligamentos: number;
  quadroMedio: number;
  totalOcorrencias: number;
}) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EmployeeDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/rh/employees");
    const data = await res.json();
    setEmployees(data.employees);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(e: EmployeeDTO) {
    setEditing(e);
    setForm({
      name: e.name,
      cargo: e.cargo,
      setor: e.setor,
      admissionDate: format(new Date(e.admissionDate), "yyyy-MM-dd"),
      status: e.status,
      phone: e.phone ?? "",
      email: e.email ?? "",
      gestorResponsavel: e.gestorResponsavel ?? "",
    });
    setShowForm(true);
  }

  async function submit() {
    if (editing) {
      await fetch(`/api/rh/employees/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/rh/employees", {
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
    await fetch(`/api/rh/employees/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Colaboradores ativos" value={formatNumber(employees.filter((e) => e.status === "ATIVO").length)} icon="Users" />
        <StatCard label="Turnover (mês)" value={formatPercent(turnover)} icon="Repeat" color="#ef4444" />
        <StatCard label="Quadro médio" value={formatNumber(quadroMedio, 1)} icon="UsersRound" />
        <StatCard label="Ocorrências no mês" value={formatNumber(totalOcorrencias)} icon="AlertTriangle" color="#eab308" />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Link href="/portal/rh/colaboradores" className="px-3 py-1.5 rounded-lg text-xs bg-nord-blue text-white">
            Colaboradores
          </Link>
          <Link href="/portal/rh/ocorrencias" className="px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white">
            Ocorrências
          </Link>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
        >
          <Plus size={13} /> Novo colaborador
        </button>
      </div>

      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-3 px-4">Nome</th>
              <th className="py-3 px-4">Cargo</th>
              <th className="py-3 px-4">Setor</th>
              <th className="py-3 px-4">Admissão</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Gestor</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 px-4 text-white">{e.name}</td>
                <td className="py-2.5 px-4 text-nord-gray">{e.cargo}</td>
                <td className="py-2.5 px-4 text-nord-gray">{e.setor}</td>
                <td className="py-2.5 px-4 text-nord-gray">{format(new Date(e.admissionDate), "dd/MM/yyyy")}</td>
                <td className="py-2.5 px-4">
                  <Badge tone={STATUS_TONE[e.status] ?? "default"}>{e.status}</Badge>
                </td>
                <td className="py-2.5 px-4 text-nord-gray">{e.gestorResponsavel}</td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(e)} className="text-nord-gray hover:text-white">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDeleteId(e.id)} className="text-nord-gray hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar colaborador" : "Novo colaborador"}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Nome">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Cargo">
            <input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className="input" />
          </Field>
          <Field label="Setor">
            <input value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} className="input" />
          </Field>
          <Field label="Data de admissão">
            <input type="date" value={form.admissionDate} onChange={(e) => setForm({ ...form, admissionDate: e.target.value })} className="input" />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
              <option value="ATIVO">Ativo</option>
              <option value="FERIAS">Férias</option>
              <option value="AFASTADO">Afastado</option>
              <option value="DESLIGADO">Desligado</option>
            </select>
          </Field>
          <Field label="Telefone">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </Field>
          <Field label="E-mail">
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
          </Field>
          <div className="col-span-2">
            <Field label="Gestor responsável">
              <input value={form.gestorResponsavel} onChange={(e) => setForm({ ...form, gestorResponsavel: e.target.value })} className="input" />
            </Field>
          </div>
        </div>
        <button onClick={submit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir colaborador"
        message="Tem certeza que deseja excluir este colaborador?"
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
