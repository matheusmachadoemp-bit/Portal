"use client";

import { useState } from "react";
import { Upload as UploadIcon, X } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { Modal, FormError } from "@/components/ui/modal";
import { MANUTENCAO_TIPO_OPTIONS } from "@/lib/manutencao";
import type { AnexoDraft } from "./types";

const emptyForm = () => ({
  tipo: "CORRETIVA",
  data: new Date().toISOString().slice(0, 10),
  horaInicio: "",
  horaFim: "",
  servicoExecutado: "",
  problemaEncontrado: "",
  solucaoAplicada: "",
  pecasTrocadas: "",
  prestador: "",
  valorMaoDeObra: "",
  valorPecas: "",
  valorOutros: "",
  garantiaServico: "",
  proximaManutencaoEm: "",
  observacoes: "",
});

export function ManutencaoRegistroModal({
  open,
  onClose,
  onSaved,
  equipamentoId,
  chamadoId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  equipamentoId: string;
  chamadoId?: string | null;
}) {
  const [form, setForm] = useState(emptyForm());
  const [anexosAntes, setAnexosAntes] = useState<AnexoDraft[]>([]);
  const [anexosDepois, setAnexosDepois] = useState<AnexoDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    setForm(emptyForm());
    setAnexosAntes([]);
    setAnexosDepois([]);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleUpload(fileList: FileList | null, target: "antes" | "depois") {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
        const draft: AnexoDraft = {
          name: `${target === "antes" ? "[Antes] " : "[Depois] "}${file.name}`,
          fileUrl: blob.url,
          mimeType: file.type,
          sizeBytes: file.size,
          tipo: file.type.startsWith("image/") ? "FOTO" : "DOCUMENTO",
        };
        if (target === "antes") setAnexosAntes((prev) => [...prev, draft]);
        else setAnexosDepois((prev) => [...prev, draft]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!form.servicoExecutado.trim()) return setError("Descreva o serviço executado.");
    if (!form.data) return setError("Informe a data da manutenção.");

    setSaving(true);
    try {
      const res = await fetch("/api/manutencao/registros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          equipamentoId,
          chamadoId: chamadoId || undefined,
          proximaManutencaoEm: form.proximaManutencaoEm || undefined,
          anexos: [...anexosAntes, ...anexosDepois],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao registrar manutenção.");
      }
      reset();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar manutenção.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Registrar manutenção realizada" widthClass="max-w-2xl">
      <FormError message={error} />
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Tipo</label>
            <select className="input w-full" value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
              {MANUTENCAO_TIPO_OPTIONS.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Data *</label>
            <input type="date" className="input w-full" value={form.data} onChange={(e) => set("data", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-nord-gray mb-1 block">Início</label>
              <input type="time" className="input w-full" value={form.horaInicio} onChange={(e) => set("horaInicio", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-nord-gray mb-1 block">Fim</label>
              <input type="time" className="input w-full" value={form.horaFim} onChange={(e) => set("horaFim", e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-nord-gray mb-1 block">Serviço executado *</label>
          <textarea className="input w-full min-h-[60px]" value={form.servicoExecutado} onChange={(e) => set("servicoExecutado", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Problema encontrado</label>
            <textarea className="input w-full min-h-[60px]" value={form.problemaEncontrado} onChange={(e) => set("problemaEncontrado", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Solução aplicada</label>
            <textarea className="input w-full min-h-[60px]" value={form.solucaoAplicada} onChange={(e) => set("solucaoAplicada", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Peças trocadas</label>
            <input className="input w-full" value={form.pecasTrocadas} onChange={(e) => set("pecasTrocadas", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Prestador</label>
            <input className="input w-full" value={form.prestador} onChange={(e) => set("prestador", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Valor mão de obra</label>
            <input type="number" step="0.01" className="input w-full" value={form.valorMaoDeObra} onChange={(e) => set("valorMaoDeObra", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Valor peças</label>
            <input type="number" step="0.01" className="input w-full" value={form.valorPecas} onChange={(e) => set("valorPecas", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Outros custos</label>
            <input type="number" step="0.01" className="input w-full" value={form.valorOutros} onChange={(e) => set("valorOutros", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Garantia do serviço</label>
            <input className="input w-full" placeholder="Ex.: 90 dias" value={form.garantiaServico} onChange={(e) => set("garantiaServico", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Próxima manutenção</label>
            <input type="date" className="input w-full" value={form.proximaManutencaoEm} onChange={(e) => set("proximaManutencaoEm", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs text-nord-gray mb-1 block">Observações</label>
          <textarea className="input w-full min-h-[50px]" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Fotos / nota fiscal — antes</label>
            <label className={`btn-outline inline-flex cursor-pointer ${uploading ? "opacity-60" : ""}`}>
              <UploadIcon size={13} /> Anexar
              <input type="file" multiple hidden onChange={(e) => handleUpload(e.target.files, "antes")} disabled={uploading} />
            </label>
            <div className="flex flex-wrap gap-2 mt-2">
              {anexosAntes.map((a, idx) => (
                <span key={idx} className="inline-flex items-center gap-1.5 bg-nord-panel border border-nord-border rounded-lg px-2 py-1 text-xs text-white">
                  {a.name}
                  <button onClick={() => setAnexosAntes((prev) => prev.filter((_, i) => i !== idx))} className="text-nord-gray hover:text-red-400">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Fotos — depois</label>
            <label className={`btn-outline inline-flex cursor-pointer ${uploading ? "opacity-60" : ""}`}>
              <UploadIcon size={13} /> Anexar
              <input type="file" multiple hidden onChange={(e) => handleUpload(e.target.files, "depois")} disabled={uploading} />
            </label>
            <div className="flex flex-wrap gap-2 mt-2">
              {anexosDepois.map((a, idx) => (
                <span key={idx} className="inline-flex items-center gap-1.5 bg-nord-panel border border-nord-border rounded-lg px-2 py-1 text-xs text-white">
                  {a.name}
                  <button onClick={() => setAnexosDepois((prev) => prev.filter((_, i) => i !== idx))} className="text-nord-gray hover:text-red-400">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving || uploading}>
            {saving ? "Salvando..." : "Registrar manutenção"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
