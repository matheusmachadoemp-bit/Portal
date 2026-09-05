"use client";

import { useState } from "react";
import { Upload as UploadIcon, X } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { Modal, FormError } from "@/components/ui/modal";
import { CHAMADO_CATEGORIA_OPTIONS, CHAMADO_PRIORIDADE_OPTIONS, SETOR_SUGESTOES } from "@/lib/manutencao";
import type { AnexoDraft } from "./types";

type EquipamentoOption = { id: string; nome: string; codigo: string; fotoUrl: string | null; setor: string };
type UserOption = { id: string; name: string };

const emptyForm = () => ({
  titulo: "",
  setor: SETOR_SUGESTOES[0],
  localEspecifico: "",
  categoria: CHAMADO_CATEGORIA_OPTIONS[0].key as string,
  equipamentoId: "",
  descricao: "",
  prioridade: "MEDIA",
  responsavelId: "",
  prazo: "",
});

export function ChamadoFormModal({
  open,
  onClose,
  onCreated,
  equipamentos,
  teamMembers,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  equipamentos: EquipamentoOption[];
  teamMembers: UserOption[];
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

  const selectedEquipamento = equipamentos.find((e) => e.id === form.equipamentoId);

  function selectEquipamento(id: string) {
    set("equipamentoId", id);
    const eq = equipamentos.find((e) => e.id === id);
    if (eq) set("setor", eq.setor);
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
        const isVideo = file.type.startsWith("video/");
        setAnexos((prev) => [
          ...prev,
          { name: file.name, fileUrl: blob.url, mimeType: file.type, sizeBytes: file.size, tipo: isVideo ? "VIDEO" : file.type.startsWith("image/") ? "FOTO" : "DOCUMENTO" },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  async function submit(status: "RASCUNHO" | "ABERTO") {
    setError(null);
    if (!form.titulo.trim()) return setError("Informe o título do chamado.");
    if (!form.descricao.trim()) return setError("Descreva o problema.");
    if (!form.setor.trim()) return setError("Informe o setor.");

    setSaving(true);
    try {
      const res = await fetch("/api/manutencao/chamados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          equipamentoId: form.equipamentoId || undefined,
          responsavelId: form.responsavelId || undefined,
          prazo: form.prazo || undefined,
          status,
          anexos,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao criar chamado.");
      }
      reset();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar chamado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Relatar problema" widthClass="max-w-2xl">
      <FormError message={error} />
      <div className="space-y-4">
        <div>
          <label className="text-xs text-nord-gray mb-1 block">Título do chamado *</label>
          <input className="input w-full" value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Geladeira não está gelando" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Setor *</label>
            <input className="input w-full" list="setores-chamado" value={form.setor} onChange={(e) => set("setor", e.target.value)} />
            <datalist id="setores-chamado">
              {SETOR_SUGESTOES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Local específico</label>
            <input className="input w-full" value={form.localEspecifico} onChange={(e) => set("localEspecifico", e.target.value)} placeholder="Ex.: próximo à câmara fria" />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Categoria</label>
            <select className="input w-full" value={form.categoria} onChange={(e) => set("categoria", e.target.value)}>
              {CHAMADO_CATEGORIA_OPTIONS.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Prioridade</label>
            <select className="input w-full" value={form.prioridade} onChange={(e) => set("prioridade", e.target.value)}>
              {CHAMADO_PRIORIDADE_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-nord-gray mb-1 block">Equipamento relacionado</label>
          <select className="input w-full" value={form.equipamentoId} onChange={(e) => selectEquipamento(e.target.value)}>
            <option value="">Nenhum equipamento específico</option>
            {equipamentos.map((e) => (
              <option key={e.id} value={e.id}>{e.nome} ({e.codigo})</option>
            ))}
          </select>
          {selectedEquipamento && (
            <p className="text-xs text-nord-gray mt-1">Código: {selectedEquipamento.codigo} · Setor: {selectedEquipamento.setor}</p>
          )}
        </div>

        <div>
          <label className="text-xs text-nord-gray mb-1 block">Descrição detalhada *</label>
          <textarea className="input w-full min-h-[80px]" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Responsável por acompanhar</label>
            <select className="input w-full" value={form.responsavelId} onChange={(e) => set("responsavelId", e.target.value)}>
              <option value="">A definir</option>
              {teamMembers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Prazo desejado</label>
            <input type="date" className="input w-full" value={form.prazo} onChange={(e) => set("prazo", e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-xs text-nord-gray mb-1 block">Fotos, vídeos e documentos</label>
          <label className={`btn-outline inline-flex cursor-pointer ${uploading ? "opacity-60" : ""}`}>
            <UploadIcon size={13} /> {uploading ? "Enviando..." : "Anexar arquivo"}
            <input type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
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
          <button className="btn-outline" onClick={() => submit("RASCUNHO")} disabled={saving || uploading}>
            Salvar como rascunho
          </button>
          <button className="btn-primary" onClick={() => submit("ABERTO")} disabled={saving || uploading}>
            {saving ? "Criando..." : "Criar chamado"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
