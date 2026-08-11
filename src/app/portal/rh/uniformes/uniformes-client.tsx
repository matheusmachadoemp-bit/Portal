"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { StatCard, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import { RhTabs } from "../rh-tabs";

type UniformDeliveryDTO = {
  id: string;
  employeeId: string;
  item: string;
  quantidade: number;
  tamanho: string | null;
  dataEntrega: string;
  responsavel: string | null;
  status: string;
  observacao: string | null;
  employee: { name: string; setor: string };
};

const ITEM_LABEL: Record<string, string> = {
  CAMISA: "Camisa",
  CALCA: "Calça",
  AVENTAL: "Avental",
  BONE: "Boné",
  TOUCA: "Touca",
  SAPATO: "Sapato",
  CINTO: "Cinto",
  OUTRO: "Outro",
};

const STATUS_LABEL: Record<string, string> = {
  ENTREGUE: "Entregue",
  TROCADO: "Trocado",
  DEVOLVIDO: "Devolvido",
  PERDIDO: "Perdido",
};

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  ENTREGUE: "success",
  TROCADO: "info",
  DEVOLVIDO: "default",
  PERDIDO: "danger",
};

function emptyForm(employeeId: string) {
  return {
    employeeId,
    item: "CAMISA",
    quantidade: "1",
    tamanho: "",
    dataEntrega: format(new Date(), "yyyy-MM-dd"),
    responsavel: "",
    status: "ENTREGUE",
    observacao: "",
  };
}

export function UniformesClient({
  initialDeliveries,
  employees,
  fixedEmployeeId,
  canCreate = true,
}: {
  initialDeliveries: UniformDeliveryDTO[];
  employees: { id: string; name: string; setor: string }[];
  fixedEmployeeId?: string;
  canCreate?: boolean;
}) {
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UniformDeliveryDTO | null>(null);
  const [form, setForm] = useState(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");

  const visible = useMemo(() => {
    return deliveries
      .filter((d) => (fixedEmployeeId ? d.employeeId === fixedEmployeeId : true))
      .filter((d) => (filterStatus ? d.status === filterStatus : true));
  }, [deliveries, fixedEmployeeId, filterStatus]);

  const totals = useMemo(() => {
    const scoped = fixedEmployeeId ? deliveries.filter((d) => d.employeeId === fixedEmployeeId) : deliveries;
    return {
      entregas: scoped.filter((d) => d.status === "ENTREGUE").length,
      trocas: scoped.filter((d) => d.status === "TROCADO").length,
      devolucoes: scoped.filter((d) => d.status === "DEVOLVIDO").length,
      perdas: scoped.filter((d) => d.status === "PERDIDO").length,
    };
  }, [deliveries, fixedEmployeeId]);

  async function refresh() {
    const url = fixedEmployeeId ? `/api/rh/uniforms?employeeId=${fixedEmployeeId}` : "/api/rh/uniforms";
    const res = await fetch(url);
    const data = await res.json();
    setDeliveries(data.deliveries);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
    setShowForm(true);
  }

  function openEdit(d: UniformDeliveryDTO) {
    setEditing(d);
    setForm({
      employeeId: d.employeeId,
      item: d.item,
      quantidade: String(d.quantidade),
      tamanho: d.tamanho ?? "",
      dataEntrega: format(new Date(d.dataEntrega), "yyyy-MM-dd"),
      responsavel: d.responsavel ?? "",
      status: d.status,
      observacao: d.observacao ?? "",
    });
    setShowForm(true);
  }

  async function submit() {
    if (editing) {
      await fetch(`/api/rh/uniforms/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/rh/uniforms", {
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
    await fetch(`/api/rh/uniforms/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Entregas" value={formatNumber(totals.entregas)} icon="PackageCheck" color="#22c55e" />
        <StatCard label="Trocas" value={formatNumber(totals.trocas)} icon="Repeat" />
        <StatCard label="Devoluções" value={formatNumber(totals.devolucoes)} icon="PackageMinus" />
        <StatCard label="Perdas" value={formatNumber(totals.perdas)} icon="PackageX" color="#ef4444" />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        {!fixedEmployeeId ? <RhTabs /> : <div />}
        {canCreate && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Registrar entrega
          </button>
        )}
      </div>
      {!canCreate && (
        <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
          registrar entregas de uniforme.
        </p>
      )}

      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input max-w-xs">
        <option value="">Todos os status</option>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>

      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              {!fixedEmployeeId && <th className="py-3 px-4">Colaborador</th>}
              <th className="py-3 px-4">Item</th>
              <th className="py-3 px-4">Quantidade</th>
              <th className="py-3 px-4">Tamanho</th>
              <th className="py-3 px-4">Data entrega</th>
              <th className="py-3 px-4">Responsável</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <tr key={d.id} className="border-b border-nord-border/50 hover:bg-white/5">
                {!fixedEmployeeId && <td className="py-2.5 px-4 text-white">{d.employee.name}</td>}
                <td className="py-2.5 px-4 text-white">{ITEM_LABEL[d.item] ?? d.item}</td>
                <td className="py-2.5 px-4 text-nord-gray">{d.quantidade}</td>
                <td className="py-2.5 px-4 text-nord-gray">{d.tamanho || "-"}</td>
                <td className="py-2.5 px-4 text-nord-gray">{format(new Date(d.dataEntrega), "dd/MM/yyyy")}</td>
                <td className="py-2.5 px-4 text-nord-gray">{d.responsavel || "-"}</td>
                <td className="py-2.5 px-4">
                  <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status] ?? d.status}</Badge>
                </td>
                <td className="py-2.5 px-4">
                  {canCreate && (
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(d)} className="text-nord-gray hover:text-white">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDeleteId(d.id)} className="text-nord-gray hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={fixedEmployeeId ? 6 : 7} className="py-8 text-center text-nord-gray text-sm">
                  Nenhuma entrega registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar entrega" : "Registrar entrega"}>
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
          <Field label="Item">
            <select value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} className="input">
              {Object.entries(ITEM_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantidade">
            <input type="number" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} className="input" />
          </Field>
          <Field label="Tamanho">
            <input value={form.tamanho} onChange={(e) => setForm({ ...form, tamanho: e.target.value })} className="input" placeholder="P, M, G, 42..." />
          </Field>
          <Field label="Data de entrega">
            <input type="date" value={form.dataEntrega} onChange={(e) => setForm({ ...form, dataEntrega: e.target.value })} className="input" />
          </Field>
          <Field label="Responsável">
            <input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} className="input" />
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
        title="Excluir entrega"
        message="Tem certeza que deseja excluir este registro?"
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
