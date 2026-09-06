"use client";

import { useState } from "react";
import { Upload as UploadIcon, X } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { Modal, FormError } from "@/components/ui/modal";
import type { AnexoDraft } from "./types";

type PrestadorOption = { id: string; nome: string };

const emptyForm = () => ({
  prestadorId: "",
  descricao: "",
  valorMaoDeObra: "",
  valorPecas: "",
  prazo: "",
  garantia: "",
});

export function OrcamentoFormModal({
  open,
  onClose,
  onSaved,
  chamadoId,
  prestadores,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  chamadoId: string;
  prestadores: PrestadorOption[];
}) {
  const [form, setForm] = useState(emptyForm());
  const [anexos, setAnexos] = useState<AnexoDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    setForm(emptyForm());
    setAnexos([]);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
        setAnexos((prev) => [...prev, { name: file.name, fileUrl: blob.url, mimeType: file.type, sizeBytes: file.size, tipo: "DOCUMENTO" }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!form.prestadorId) return setError("Selecione o prestador.");

    setSaving(true);
    try {
      const res = await fetch(`/api/manutencao/chamados/${chamadoId}/orcamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, anexos }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao registrar orçamento.");
      }
      reset();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar orçamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Adicionar orçamento" widthClass="max-w-lg">
      <FormError message={error} />
      <div className="space-y-4">
        <div>
          <label className="text-xs text-nord-gray mb-1 block">Prestador *</label>
          <select className="input w-full" value={form.prestadorId} onChange={(e) => set("prestadorId", e.target.value)}>
            <option value="">Selecione...</option>
            {prestadores.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-nord-gray mb-1 block">Descrição</label>
          <textarea className="input w-full min-h-[60px]" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Mão de obra</label>
            <input type="number" step="0.01" className="input w-full" value={form.valorMaoDeObra} onChange={(e) => set("valorMaoDeObra", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Peças</label>
            <input type="number" step="0.01" className="input w-full" value={form.valorPecas} onChange={(e) => set("valorPecas", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Prazo</label>
            <input className="input w-full" placeholder="Ex.: 3 dias úteis" value={form.prazo} onChange={(e) => set("prazo", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Garantia</label>
            <input className="input w-full" placeholder="Ex.: 90 dias" value={form.garantia} onChange={(e) => set("garantia", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs text-nord-gray mb-1 block">Documento do orçamento</label>
          <label className={`btn-outline inline-flex cursor-pointer ${uploading ? "opacity-60" : ""}`}>
            <UploadIcon size={13} /> {uploading ? "Enviando..." : "Anexar arquivo"}
            <input type="file" hidden onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
          </label>
          {anexos.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {anexos.map((a, idx) => (
                <span key={idx} className="inline-flex items-center gap-1.5 bg-nord-panel border border-nord-border rounded-lg px-2 py-1 text-xs text-white">
                  {a.name}
                  <button onClick={() => setAnexos((prev) => prev.filter((_, i) => i !== idx))} className="text-nord-gray hover:text-red-400">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving || uploading}>
            {saving ? "Salvando..." : "Adicionar orçamento"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
