"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Paperclip, FileText } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
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
  termoAssinadoUrl: string | null;
  termoAssinadoNome: string | null;
  termoAssinadoMimeType: string | null;
  employee: { name: string; setor: string };
};

type ExistingTermo = { url: string; nome: string | null; mimeType: string | null };

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
  isGrupoNordMode = true,
}: {
  initialDeliveries: UniformDeliveryDTO[];
  employees: { id: string; name: string; setor: string }[];
  fixedEmployeeId?: string;
  canCreate?: boolean;
  /** Diferencia por que `canCreate` é falso: modo Grupo Nord (consolidado) ou permissão do perfil numa loja específica. */
  isGrupoNordMode?: boolean;
}) {
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UniformDeliveryDTO | null>(null);
  const [form, setForm] = useState(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingTermo, setUploadingTermo] = useState(false);
  const [termoFile, setTermoFile] = useState<File | null>(null);
  const [termoFilePreviewUrl, setTermoFilePreviewUrl] = useState<string | null>(null);
  const [existingTermo, setExistingTermo] = useState<ExistingTermo | null>(null);
  const [removeTermo, setRemoveTermo] = useState(false);

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

  function resetTermoState(d?: UniformDeliveryDTO) {
    if (termoFilePreviewUrl) URL.revokeObjectURL(termoFilePreviewUrl);
    setTermoFile(null);
    setTermoFilePreviewUrl(null);
    setRemoveTermo(false);
    setExistingTermo(d?.termoAssinadoUrl ? { url: d.termoAssinadoUrl, nome: d.termoAssinadoNome, mimeType: d.termoAssinadoMimeType } : null);
  }

  function handleTermoFileChange(f: File | null) {
    if (termoFilePreviewUrl) URL.revokeObjectURL(termoFilePreviewUrl);
    setTermoFile(f);
    setTermoFilePreviewUrl(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setRemoveTermo(false);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
    resetTermoState();
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
    resetTermoState(d);
    setShowForm(true);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      let termoPayload: Record<string, string | null> = {};
      if (termoFile) {
        setUploadingTermo(true);
        try {
          const blob = await upload(sanitizeFileName(termoFile.name), termoFile, {
            access: "public",
            handleUploadUrl: "/api/upload",
          });
          termoPayload = {
            termoAssinadoUrl: blob.url,
            termoAssinadoNome: termoFile.name,
            termoAssinadoMimeType: termoFile.type,
          };
        } finally {
          setUploadingTermo(false);
        }
      } else if (removeTermo) {
        termoPayload = { termoAssinadoUrl: null, termoAssinadoNome: null, termoAssinadoMimeType: null };
      }

      const payload = { ...form, ...termoPayload };

      if (editing) {
        await fetch(`/api/rh/uniforms/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/rh/uniforms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
    await fetch(`/api/rh/uniforms/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="rh-uniformes-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "entregas", label: "Entregas", value: formatNumber(totals.entregas), icon: "PackageCheck", color: "#22c55e" },
          { key: "trocas", label: "Trocas", value: formatNumber(totals.trocas), icon: "Repeat" },
          { key: "devolucoes", label: "Devoluções", value: formatNumber(totals.devolucoes), icon: "PackageMinus" },
          { key: "perdas", label: "Perdas", value: formatNumber(totals.perdas), icon: "PackageX", color: "#ef4444" },
        ]}
      />

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
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          {isGrupoNordMode
            ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para registrar entregas de uniforme."
            : "Seu perfil de permissão não permite registrar entregas de uniforme neste módulo."}
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
              <th className="py-3 px-4">Termo</th>
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
                  {d.termoAssinadoUrl ? (
                    <a
                      href={d.termoAssinadoUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={d.termoAssinadoNome ?? "Termo assinado"}
                      className="inline-flex items-center gap-1 text-[11px] text-nord-blue-light hover:underline"
                    >
                      <Paperclip size={12} /> Anexado
                    </a>
                  ) : (
                    <span className="text-nord-gray text-xs">-</span>
                  )}
                </td>
                <td className="py-2.5 px-4">
                  {canCreate && (
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(d)} className="text-nord-gray hover:text-white">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDeleteId(d.id)} className="text-nord-gray hover:text-nord-danger">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={fixedEmployeeId ? 7 : 8} className="py-8 text-center text-nord-gray text-sm">
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
          <div className="col-span-2">
            <Field label="Termo assinado (foto ou PDF, opcional)">
              {termoFile ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-nord-border bg-nord-panel px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-white truncate">
                    {termoFilePreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- preview de blob local (URL.createObjectURL), não é asset otimizável pelo next/image
                      <img src={termoFilePreviewUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                    ) : (
                      <FileText size={14} className="text-nord-gray shrink-0" />
                    )}
                    <span className="truncate">{termoFile.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTermoFileChange(null)}
                    className="text-nord-gray hover:text-nord-danger shrink-0"
                    title="Cancelar seleção"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : existingTermo && !removeTermo ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-nord-border bg-nord-panel px-3 py-2">
                  <a
                    href={existingTermo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-nord-blue-light hover:underline truncate"
                  >
                    {existingTermo.mimeType?.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element -- preview de anexo externo (Vercel Blob), fora do domínio otimizado pelo next/image
                      <img src={existingTermo.url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                    ) : (
                      <FileText size={14} className="shrink-0" />
                    )}
                    <span className="truncate">{existingTermo.nome || "Termo assinado"}</span>
                  </a>
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="text-xs text-nord-gray hover:text-white cursor-pointer">
                      Trocar
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => handleTermoFileChange(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setRemoveTermo(true)}
                      className="text-nord-gray hover:text-nord-danger"
                      title="Remover anexo"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => handleTermoFileChange(e.target.files?.[0] ?? null)}
                  className="input"
                />
              )}
              {removeTermo && (
                <p className="mt-1.5 text-[11px] text-nord-warning">
                  O termo assinado será removido ao salvar.{" "}
                  <button type="button" onClick={() => setRemoveTermo(false)} className="underline hover:text-white">
                    Desfazer
                  </button>
                </p>
              )}
            </Field>
          </div>
        </div>
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg py-2.5"
        >
          {uploadingTermo ? "Enviando anexo..." : submitting ? "Salvando..." : "Salvar"}
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
