"use client";

import { useState } from "react";
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

function formFromEquipamento(equipamento?: EquipamentoDTO | null) {
  if (!equipamento) return emptyForm();
  return {
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
  };
}

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
  // O formulário nasce direto a partir do equipamento recebido (sem efeito
  // pra sincronizar depois). Quem chama este modal remonta o componente
  // (via `key`) toda vez que ele abre, então este estado inicial já é
  // suficiente pra cobrir criar, editar e reabrir o modal mais tarde.
  const [form, setForm] = useState(() => formFromEquipamento(equipamento));
  const [anexos, setAnexos] = useState<AnexoDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (saving) return;
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
          <Field label="Nome do equipamento *" className="col-span-2">
            <input className="input w-full" value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Geladeira da cozinha" />
          </Field>
          <Field label="Setor *">
            <input className="input w-full" list="setores-sugestoes" value={form.setor} onChange={(e) => set("setor", e.target.value)} />
            <datalist id="setores-sugestoes">
              {SETOR_SUGESTOES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Categoria *">
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
          </Field>
          <Field label="Localização" className="col-span-2">
            <input className="input w-full" value={form.localizacao} onChange={(e) => set("localizacao", e.target.value)} placeholder="Ex.: Área de preparo, próximo à câmara fria" />
          </Field>
          <Field label="Marca">
            <input className="input w-full" value={form.marca} onChange={(e) => set("marca", e.target.value)} />
          </Field>
          <Field label="Modelo">
            <input className="input w-full" value={form.modelo} onChange={(e) => set("modelo", e.target.value)} />
          </Field>
          <Field label="Número de série">
            <input className="input w-full" value={form.numeroSerie} onChange={(e) => set("numeroSerie", e.target.value)} />
          </Field>
          <Field label="Fornecedor">
            <input className="input w-full" value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} />
          </Field>
          <Field label="Data da compra">
            <input type="date" className="input w-full" value={form.dataCompra} onChange={(e) => set("dataCompra", e.target.value)} />
          </Field>
          <Field label="Valor da compra">
            <input type="number" step="0.01" className="input w-full" value={form.valorCompra} onChange={(e) => set("valorCompra", e.target.value)} />
          </Field>
          <Field label="Número da nota fiscal">
            <input className="input w-full" value={form.numeroNotaFiscal} onChange={(e) => set("numeroNotaFiscal", e.target.value)} />
          </Field>
          <Field label="Garantia até">
            <input type="date" className="input w-full" value={form.garantiaAte} onChange={(e) => set("garantiaAte", e.target.value)} />
          </Field>
          <Field label="Vida útil estimada (meses)">
            <input type="number" className="input w-full" value={form.vidaUtilEstimadaMeses} onChange={(e) => set("vidaUtilEstimadaMeses", e.target.value)} />
          </Field>
          <Field label="Frequência de manutenção">
            <select className="input w-full" value={form.frequenciaManutencao} onChange={(e) => set("frequenciaManutencao", e.target.value)}>
              {MANUTENCAO_FREQUENCIA_OPTIONS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Prestador recomendado" className="col-span-2">
            <input className="input w-full" value={form.prestadorRecomendado} onChange={(e) => set("prestadorRecomendado", e.target.value)} />
          </Field>
          <Field label="Observações" className="col-span-2">
            <textarea className="input w-full min-h-[70px]" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
          </Field>
        </div>

        <div>
          <span className="text-xs text-nord-gray mb-1 block">Fotos, manual, nota fiscal, certificado de garantia</span>
          <label className={`btn-outline inline-flex cursor-pointer ${uploading ? "opacity-60" : ""}`}>
            <UploadIcon size={13} /> {uploading ? "Enviando..." : "Anexar arquivo"}
            <input type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
          </label>
          {anexos.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {anexos.map((a, idx) => (
                <span key={idx} className="inline-flex items-center gap-1.5 bg-nord-panel border border-nord-border rounded-lg px-2 py-1 text-xs text-white">
                  {a.name}
                  <button onClick={() => setAnexos((prev) => prev.filter((_, i) => i !== idx))} className="text-nord-gray hover:text-nord-danger">
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

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-nord-gray mb-1 block">{label}</span>
      {children}
    </label>
  );
}
