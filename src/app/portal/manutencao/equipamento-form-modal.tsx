"use client";

import { useEffect, useState } from "react";
import { Upload as UploadIcon, X } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { Modal, FormError } from "@/components/ui/modal";
import { EQUIPAMENTO_CATEGORIA_SUGESTOES, MANUTENCAO_FREQUENCIA_OPTIONS, SETOR_SUGESTOES } from "@/lib/manutencao";
import type { AnexoDraft, EquipamentoDTO } from "./types";

const emptyForm = () => ({
  nome: "",
  fotoUrl: "",
  setor: SETOR_SUGESTOES[0],
  localizacao: "",
  categoria: EQUIPAMENTO_CATEGORIA_SUGESTOES[0],
  marca: "",
  modelo: "",
  numeroSerie: "",
  dataCompra: "",
  valorCompra: "",
  fornecedor: "",
  numeroNotaFiscal: "",
  garantiaAte: "",
  vidaUtilEstimadaMeses: "",
  frequenciaManutencao: "NENHUMA",
  prestadorRecomendado: "",
  observacoes: "",
});

export function EquipamentoFormModal({
  open,
  onClose,
  onSaved,
  equipamento,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  equipamento?: EquipamentoDTO | null;
}) {
  const [form, setForm] = useState(emptyForm());
  const [anexos, setAnexos] = useState<AnexoDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (equipamento) {
      setForm({
        nome: equipamento.nome,
        fotoUrl: equipamento.fotoUrl ?? "",
        setor: equipamento.setor,
        localizacao: equipamento.localizacao ?? "",
        categoria: equipamento.categoria,
        marca: equipamento.marca ?? "",
        modelo: equipamento.modelo ?? "",
        numeroSerie: equipamento.numeroSerie ?? "",
        dataCompra: equipamento.dataCompra ? equipamento.dataCompra.slice(0, 10) : "",
        valorCompra: equipamento.valorCompra != null ? String(equipamento.valorCompra) : "",
        fornecedor: equipamento.fornecedor ?? "",
        numeroNotaFiscal: equipamento.numeroNotaFiscal ?? "",
        garantiaAte: equipamento.garantiaAte ? equipamento.garantiaAte.slice(0, 10) : "",
        vidaUtilEstimadaMeses: equipamento.vidaUtilEstimadaMeses != null ? String(equipamento.vidaUtilEstimadaMeses) : "",
        frequenciaManutencao: equipamento.frequenciaManutencao,
        prestadorRecomendado: equipamento.prestadorRecomendado ?? "",
        observacoes: equipamento.observacoes ?? "",
      });
    } else {
      setForm(emptyForm());
    }
    setAnexos([]);
    setError(null);
  }, [open, equipamento]);

  function set<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
        const isImage = file.type.startsWith("image/");
        setAnexos((prev) => [
          ...prev,
          { name: file.name, fileUrl: blob.url, mimeType: file.type, sizeBytes: file.size, tipo: isImage ? "FOTO" : "DOCUMENTO" },
        ]);
        if (isImage && !form.fotoUrl) set("fotoUrl", blob.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!form.nome.trim()) return setError("Informe o nome do equipamento.");
    if (!form.setor.trim()) return setError("Informe o setor.");
    if (!form.categoria.trim()) return setError("Informe a categoria.");

    setSaving(true);
    try {
      const payload = {
        ...form,
        valorCompra: form.valorCompra || undefined,
        vidaUtilEstimadaMeses: form.vidaUtilEstimadaMeses || undefined,
        dataCompra: form.dataCompra || undefined,
        garantiaAte: form.garantiaAte || undefined,
        anexos,
      };
      const res = await fetch(equipamento ? `/api/manutencao/equipamentos/${equipamento.id}` : "/api/manutencao/equipamentos", {
        method: equipamento ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao salvar equipamento.");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar equipamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={equipamento ? "Editar equipamento" : "Novo equipamento"} widthClass="max-w-2xl">
      <FormError message={error} />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-nord-gray mb-1 block">Nome do equipamento *</label>
            <input className="input w-full" value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Geladeira da cozinha" />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Setor *</label>
            <input className="input w-full" list="setores-sugestoes" value={form.setor} onChange={(e) => set("setor", e.target.value)} />
            <datalist id="setores-sugestoes">
              {SETOR_SUGESTOES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Categoria *</label>
            <input
              className="input w-full"
              list="categorias-sugestoes"
              value={form.categoria}
              onChange={(e) => set("categoria", e.target.value)}
            />
            <datalist id="categorias-sugestoes">
              {EQUIPAMENTO_CATEGORIA_SUGESTOES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-nord-gray mb-1 block">Localização</label>
            <input className="input w-full" value={form.localizacao} onChange={(e) => set("localizacao", e.target.value)} placeholder="Ex.: Área de preparo, próximo à câmara fria" />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Marca</label>
            <input className="input w-full" value={form.marca} onChange={(e) => set("marca", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Modelo</label>
            <input className="input w-full" value={form.modelo} onChange={(e) => set("modelo", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Número de série</label>
            <input className="input w-full" value={form.numeroSerie} onChange={(e) => set("numeroSerie", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Fornecedor</label>
            <input className="input w-full" value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Data da compra</label>
            <input type="date" className="input w-full" value={form.dataCompra} onChange={(e) => set("dataCompra", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Valor da compra</label>
            <input type="number" step="0.01" className="input w-full" value={form.valorCompra} onChange={(e) => set("valorCompra", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Número da nota fiscal</label>
            <input className="input w-full" value={form.numeroNotaFiscal} onChange={(e) => set("numeroNotaFiscal", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Garantia até</label>
            <input type="date" className="input w-full" value={form.garantiaAte} onChange={(e) => set("garantiaAte", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Vida útil estimada (meses)</label>
            <input type="number" className="input w-full" value={form.vidaUtilEstimadaMeses} onChange={(e) => set("vidaUtilEstimadaMeses", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Frequência de manutenção</label>
            <select className="input w-full" value={form.frequenciaManutencao} onChange={(e) => set("frequenciaManutencao", e.target.value)}>
              {MANUTENCAO_FREQUENCIA_OPTIONS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-nord-gray mb-1 block">Prestador recomendado</label>
            <input className="input w-full" value={form.prestadorRecomendado} onChange={(e) => set("prestadorRecomendado", e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-nord-gray mb-1 block">Observações</label>
            <textarea className="input w-full min-h-[70px]" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-xs text-nord-gray mb-1 block">Fotos, manual, nota fiscal, certificado de garantia</label>
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
          <button className="btn-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving || uploading}>
            {saving ? "Salvando..." : "Salvar equipamento"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
