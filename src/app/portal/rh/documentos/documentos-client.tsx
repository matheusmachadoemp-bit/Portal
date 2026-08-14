"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Download, AlertTriangle, FileText } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatNumber } from "@/lib/calc";
import { documentStatus, documentosAlerts } from "@/lib/rh-helpers";
import { format } from "date-fns";
import { RhTabs } from "../rh-tabs";

type DocumentDTO = {
  id: string;
  employeeId: string;
  categoria: string;
  nome: string;
  fileUrl: string;
  mimeType: string | null;
  validade: string | null;
  observacao: string | null;
  employee: { name: string; setor: string };
};

const CATEGORIA_LABEL: Record<string, string> = {
  RG: "RG",
  CPF: "CPF",
  CTPS: "CTPS",
  COMPROVANTE_RESIDENCIA: "Comprovante de residência",
  TITULO_ELEITOR: "Título de eleitor",
  RESERVISTA: "Reservista",
  EXAME_ADMISSIONAL: "Exame admissional",
  ASO: "ASO",
  CNH: "CNH",
  CONTRATO: "Contrato",
  TERMO: "Termo",
  CERTIFICADO: "Certificado",
  TREINAMENTO: "Treinamento",
  OUTRO: "Outro",
};

const DOC_STATUS_LABEL: Record<string, string> = {
  valido: "Válido",
  vencendo: "Vencendo",
  vencido: "Vencido",
  "sem-validade": "Sem validade",
};

const DOC_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger"> = {
  valido: "success",
  vencendo: "warning",
  vencido: "danger",
  "sem-validade": "default",
};

function emptyForm(employeeId: string) {
  return { employeeId, categoria: "RG", nome: "", validade: "", observacao: "" };
}

export function DocumentosClient({
  initialDocuments,
  employees,
  fixedEmployeeId,
  canCreate = true,
}: {
  initialDocuments: DocumentDTO[];
  employees: { id: string; name: string; setor: string }[];
  fixedEmployeeId?: string;
  canCreate?: boolean;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const visible = useMemo(() => {
    return fixedEmployeeId ? documents.filter((d) => d.employeeId === fixedEmployeeId) : documents;
  }, [documents, fixedEmployeeId]);

  const alerts = useMemo(() => documentosAlerts(visible), [visible]);

  const totals = useMemo(() => {
    const vencendo = visible.filter((d) => documentStatus(d.validade) === "vencendo").length;
    const vencidos = visible.filter((d) => documentStatus(d.validade) === "vencido").length;
    return { total: visible.length, vencendo, vencidos };
  }, [visible]);

  async function refresh() {
    const url = fixedEmployeeId ? `/api/rh/documents?employeeId=${fixedEmployeeId}` : "/api/rh/documents";
    const res = await fetch(url);
    const data = await res.json();
    setDocuments(data.documents);
  }

  function openNew() {
    setForm(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
    setFile(null);
    setShowForm(true);
  }

  async function submit() {
    if (!file) return;
    setUploading(true);
    try {
      const uploadData = new FormData();
      uploadData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: uploadData });
      const uploaded = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploaded.error ?? "Falha no upload.");

      await fetch("/api/rh/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          nome: form.nome || file.name,
          fileUrl: uploaded.fileUrl,
          mimeType: uploaded.mimeType,
        }),
      });
      setShowForm(false);
      refresh();
    } finally {
      setUploading(false);
    }
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/rh/documents/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="rh-documentos-kpi-order"
        className="grid grid-cols-2 md:grid-cols-3 gap-4"
        cards={[
          { key: "documentos-cadastrados", label: "Documentos cadastrados", value: formatNumber(totals.total), icon: "FileText" },
          { key: "vencendo-30-dias", label: "Vencendo em 30 dias", value: formatNumber(totals.vencendo), icon: "AlertTriangle", color: "#eab308" },
          { key: "vencidos", label: "Vencidos", value: formatNumber(totals.vencidos), icon: "AlertOctagon", color: "#ef4444" },
        ]}
      />

      <div className="flex items-center justify-between">
        {!fixedEmployeeId ? <RhTabs /> : <div />}
        {canCreate && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Novo documento
          </button>
        )}
      </div>
      {!canCreate && (
        <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
          enviar documentos.
        </p>
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

      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              {!fixedEmployeeId && <th className="py-3 px-4">Colaborador</th>}
              <th className="py-3 px-4">Documento</th>
              <th className="py-3 px-4">Categoria</th>
              <th className="py-3 px-4">Validade</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => {
              const status = documentStatus(d.validade);
              return (
                <tr key={d.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  {!fixedEmployeeId && <td className="py-2.5 px-4 text-white">{d.employee.name}</td>}
                  <td className="py-2.5 px-4 text-white">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-nord-gray shrink-0" />
                      {d.nome}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-nord-gray">{CATEGORIA_LABEL[d.categoria] ?? d.categoria}</td>
                  <td className="py-2.5 px-4 text-nord-gray">{d.validade ? format(new Date(d.validade), "dd/MM/yyyy") : "-"}</td>
                  <td className="py-2.5 px-4">
                    <Badge tone={DOC_STATUS_TONE[status]}>{DOC_STATUS_LABEL[status]}</Badge>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3 justify-end">
                      <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-nord-gray hover:text-white">
                        <Download size={14} />
                      </a>
                      {canCreate && (
                        <button onClick={() => setConfirmDeleteId(d.id)} className="text-nord-gray hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={fixedEmployeeId ? 4 : 5} className="py-8 text-center text-nord-gray text-sm">
                  Nenhum documento cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Novo documento">
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
          <Field label="Categoria">
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="input">
              {Object.entries(CATEGORIA_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Validade (opcional)">
            <input type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} className="input" />
          </Field>
          <div className="col-span-2">
            <Field label="Nome do documento">
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="input" placeholder="Ex: RG frente e verso" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Arquivo (PDF, imagem...)">
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="input" />
            </Field>
          </div>
        </div>
        <button
          onClick={submit}
          disabled={!file || uploading}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {uploading ? "Enviando..." : "Salvar"}
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir documento"
        message="Tem certeza que deseja excluir este documento?"
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
