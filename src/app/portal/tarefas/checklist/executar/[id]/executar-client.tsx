"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { ArrowLeft, Camera, CheckCircle2, Circle, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/stat-card";
import { sanitizeFileName } from "@/lib/upload";
import { GOAL_CATEGORY_LABEL, type GoalCategoryKey } from "@/lib/goals";
import { CHECKLIST_STATUS_LABEL, CHECKLIST_STATUS_TONE } from "@/lib/checklist";

type Photo = { id: string; fileUrl: string; fileName: string; itemResponseId: string | null };
type ItemResponse = {
  id: string;
  itemTemplateId: string;
  status: string;
  valorTexto: string | null;
  valorNumero: number | null;
  valorBooleano: boolean | null;
  observacao: string | null;
  fotos: Photo[];
};
type ItemTemplate = {
  id: string;
  title: string;
  orientacao: string | null;
  tipo: string;
  obrigatorio: boolean;
  fotoObrigatoria: boolean;
  ativo?: boolean;
};
type Occurrence = {
  id: string;
  status: string;
  releaseAt: string;
  dueAt: string;
  startedAt: string | null;
  completedAt: string | null;
  empresa: { name: string };
  responsavel: { name: string } | null;
  respostas: ItemResponse[];
  fotos: Photo[];
  template: {
    name: string;
    setor: string;
    fotoChecklist: string;
    exigirObservacaoProblema: boolean;
    itens: ItemTemplate[];
  };
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function ExecutarClient({ occurrence: initial }: { occurrence: Occurrence }) {
  const router = useRouter();
  const [occurrence, setOccurrence] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [problemItem, setProblemItem] = useState<string | null>(null);
  const [observacaoDraft, setObservacaoDraft] = useState("");
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  const [uploadingGeral, setUploadingGeral] = useState(false);

  const responseByItem = useMemo(() => new Map(occurrence.respostas.map((r) => [r.itemTemplateId, r])), [occurrence.respostas]);
  const visibleItens = useMemo(() => occurrence.template.itens.filter((i) => i.ativo !== false), [occurrence.template.itens]);
  const answeredCount = visibleItens.filter((i) => {
    const r = responseByItem.get(i.id);
    return r && r.status !== "PENDENTE";
  }).length;
  const totalItens = visibleItens.length;
  const remaining = Math.round((new Date(occurrence.dueAt).getTime() - new Date().getTime()) / 60000);
  const isDone = !!occurrence.completedAt;

  async function refresh() {
    const res = await fetch(`/api/checklist/occurrences/${occurrence.id}`);
    const data = await res.json();
    setOccurrence(data.occurrence);
  }

  async function saveResponse(itemTemplateId: string, patch: Record<string, unknown>) {
    setSaving(itemTemplateId);
    try {
      await fetch(`/api/checklist/occurrences/${occurrence.id}/responses`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemTemplateId, ...patch }),
      });
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  async function markDone(itemTemplateId: string) {
    await saveResponse(itemTemplateId, { status: "CONCLUIDO" });
  }

  async function submitProblem(itemTemplateId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/checklist/occurrences/${occurrence.id}/responses`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemTemplateId, status: "PROBLEMA", observacao: observacaoDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProblemItem(null);
      setObservacaoDraft("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar o problema.");
    }
  }

  async function uploadPhoto(file: File, itemResponseId: string | null) {
    const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
    await fetch(`/api/checklist/occurrences/${occurrence.id}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl: blob.url, fileName: file.name, mimeType: file.type, itemResponseId }),
    });
    await refresh();
  }

  async function handleItemPhoto(item: ItemTemplate, file: File | undefined) {
    if (!file) return;
    setUploadingItem(item.id);
    setError(null);
    try {
      let responseId = responseByItem.get(item.id)?.id;
      if (!responseId) {
        await saveResponse(item.id, { status: item.tipo === "FOTO" ? "CONCLUIDO" : "PENDENTE" });
        const res = await fetch(`/api/checklist/occurrences/${occurrence.id}`);
        const data = await res.json();
        responseId = data.occurrence.respostas.find((r: ItemResponse) => r.itemTemplateId === item.id)?.id;
      }
      await uploadPhoto(file, responseId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a foto.");
    } finally {
      setUploadingItem(null);
    }
  }

  async function handleGeralPhoto(file: File | undefined) {
    if (!file) return;
    setUploadingGeral(true);
    setError(null);
    try {
      await uploadPhoto(file, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a foto.");
    } finally {
      setUploadingGeral(false);
    }
  }

  async function conclude() {
    setError(null);
    setCompleting(true);
    try {
      const res = await fetch(`/api/checklist/occurrences/${occurrence.id}/complete`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOccurrence((o) => ({ ...o, ...data.occurrence }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir o checklist.");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24">
      <button onClick={() => router.push("/portal/tarefas/checklist")} className="flex items-center gap-1.5 text-xs text-nord-gray hover:text-white">
        <ArrowLeft size={14} /> Voltar
      </button>

      <div className="nord-card p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-white font-semibold">{occurrence.template.name}</h2>
          <Badge tone={CHECKLIST_STATUS_TONE[occurrence.status as keyof typeof CHECKLIST_STATUS_TONE]}>
            {CHECKLIST_STATUS_LABEL[occurrence.status as keyof typeof CHECKLIST_STATUS_LABEL]}
          </Badge>
        </div>
        <p className="text-xs text-nord-gray">
          {occurrence.empresa.name} · {GOAL_CATEGORY_LABEL[occurrence.template.setor as GoalCategoryKey] ?? occurrence.template.setor}
          {occurrence.responsavel ? ` · ${occurrence.responsavel.name}` : ""}
        </p>
        <div className="flex items-center gap-4 text-xs text-nord-gray">
          <span>Liberação: {formatTime(occurrence.releaseAt)}</span>
          <span>Limite: {formatTime(occurrence.dueAt)}</span>
        </div>
        {!isDone && (
          <p className="text-xs flex items-center gap-1.5 text-amber-400">
            <Clock size={12} />
            {remaining >= 0 ? `${remaining} min restantes` : `${-remaining} min de atraso`}
          </p>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-nord-border overflow-hidden">
            <div
              className="h-full rounded-full bg-nord-blue"
              style={{ width: totalItens > 0 ? `${(answeredCount / totalItens) * 100}%` : "0%" }}
            />
          </div>
          <span className="text-xs text-nord-gray shrink-0">
            {answeredCount}/{totalItens} itens
          </span>
        </div>
        {occurrence.template.fotoChecklist !== "SEM_FOTO" && (
          <div className="pt-1">
            <label className="flex items-center gap-1.5 text-xs text-nord-blue-light cursor-pointer w-fit">
              <Camera size={13} />
              {uploadingGeral ? "Enviando..." : "Foto geral do checklist"}
              {occurrence.template.fotoChecklist === "OBRIGATORIA" && <span className="text-amber-400">*</span>}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={uploadingGeral || isDone}
                onChange={(e) => handleGeralPhoto(e.target.files?.[0])}
              />
            </label>
            {occurrence.fotos.filter((f) => !f.itemResponseId).length > 0 && (
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {occurrence.fotos
                  .filter((f) => !f.itemResponseId)
                  .map((f) => (
                    <a key={f.id} href={f.fileUrl} target="_blank" rel="noreferrer">
                      <img src={f.fileUrl} alt={f.fileName} className="w-12 h-12 object-cover rounded-lg border border-nord-border" />
                    </a>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isDone && (
        <div className={`nord-card p-4 text-center ${occurrence.status === "CONCLUIDO_NO_PRAZO" ? "border-emerald-500/40" : "border-amber-500/40"}`}>
          <CheckCircle2 size={28} className={occurrence.status === "CONCLUIDO_NO_PRAZO" ? "text-emerald-400 mx-auto mb-2" : "text-amber-400 mx-auto mb-2"} />
          <p className="text-white font-medium">
            {occurrence.status === "CONCLUIDO_NO_PRAZO" ? "Checklist concluído no prazo" : "Checklist concluído com atraso"}
          </p>
        </div>
      )}

      {error && (
        <div className="nord-card p-3 border-red-500/40 bg-red-500/5 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {visibleItens.map((item) => {
          const resp = responseByItem.get(item.id);
          const status = resp?.status ?? "PENDENTE";
          const itemPhotos = resp?.fotos ?? [];
          return (
            <div key={item.id} className="nord-card p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium">
                    {item.title}
                    {item.obrigatorio && <span className="text-amber-400"> *</span>}
                  </p>
                  {item.orientacao && <p className="text-xs text-nord-gray mt-0.5">{item.orientacao}</p>}
                </div>
                <Badge tone={status === "CONCLUIDO" ? "success" : status === "PROBLEMA" ? "danger" : "default"}>
                  {status === "CONCLUIDO" ? "Concluído" : status === "PROBLEMA" ? "Problema" : "Pendente"}
                </Badge>
              </div>

              {!isDone && (
                <div className="space-y-2">
                  {item.tipo === "CONCLUIDO" && (
                    <button
                      onClick={() => markDone(item.id)}
                      disabled={saving === item.id}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium ${
                        status === "CONCLUIDO" ? "bg-emerald-500/15 text-emerald-400" : "bg-nord-panel border border-nord-border text-white"
                      }`}
                    >
                      {status === "CONCLUIDO" ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                      Marcar como concluído
                    </button>
                  )}

                  {(item.tipo === "TEXTO_CURTO" || item.tipo === "NUMERO" || item.tipo === "TEMPERATURA" || item.tipo === "QUANTIDADE") && (
                    <input
                      type={item.tipo === "TEXTO_CURTO" ? "text" : "number"}
                      defaultValue={item.tipo === "TEXTO_CURTO" ? resp?.valorTexto ?? "" : resp?.valorNumero ?? ""}
                      placeholder={item.tipo === "TEMPERATURA" ? "°C" : item.tipo === "TEXTO_CURTO" ? "Resposta" : "Valor"}
                      className="input"
                      onBlur={(e) =>
                        e.target.value &&
                        saveResponse(item.id, item.tipo === "TEXTO_CURTO" ? { valorTexto: e.target.value } : { valorNumero: e.target.value })
                      }
                    />
                  )}

                  {item.tipo === "TEXTO_LONGO" && (
                    <textarea
                      defaultValue={resp?.valorTexto ?? ""}
                      className="input min-h-20"
                      onBlur={(e) => e.target.value && saveResponse(item.id, { valorTexto: e.target.value })}
                    />
                  )}

                  {item.tipo === "SIM_NAO" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveResponse(item.id, { status: "CONCLUIDO", valorBooleano: true })}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                          resp?.valorBooleano === true ? "bg-nord-blue text-white" : "bg-nord-panel border border-nord-border text-white"
                        }`}
                      >
                        Sim
                      </button>
                      <button
                        onClick={() => saveResponse(item.id, { status: "CONCLUIDO", valorBooleano: false })}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                          resp?.valorBooleano === false ? "bg-nord-blue text-white" : "bg-nord-panel border border-nord-border text-white"
                        }`}
                      >
                        Não
                      </button>
                    </div>
                  )}

                  {(item.tipo === "FOTO" || item.fotoObrigatoria) && (
                    <label className="flex items-center gap-1.5 text-xs text-nord-blue-light cursor-pointer w-fit">
                      <Camera size={13} />
                      {uploadingItem === item.id ? "Enviando..." : "Tirar/enviar foto"}
                      {item.fotoObrigatoria && <span className="text-amber-400">*</span>}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        disabled={uploadingItem === item.id}
                        onChange={(e) => handleItemPhoto(item, e.target.files?.[0])}
                      />
                    </label>
                  )}
                  {itemPhotos.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {itemPhotos.map((f) => (
                        <a key={f.id} href={f.fileUrl} target="_blank" rel="noreferrer">
                          <img src={f.fileUrl} alt={f.fileName} className="w-12 h-12 object-cover rounded-lg border border-nord-border" />
                        </a>
                      ))}
                    </div>
                  )}

                  {problemItem === item.id ? (
                    <div className="space-y-1.5 pt-1 border-t border-nord-border/60">
                      <textarea
                        value={observacaoDraft}
                        onChange={(e) => setObservacaoDraft(e.target.value)}
                        placeholder="Descreva o problema encontrado..."
                        className="input min-h-16"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => submitProblem(item.id)} className="flex-1 bg-red-500/15 text-red-300 text-xs font-medium rounded-lg py-2">
                          Registrar problema
                        </button>
                        <button onClick={() => setProblemItem(null)} className="text-xs text-nord-gray px-3">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setProblemItem(item.id);
                        setObservacaoDraft(resp?.observacao ?? "");
                      }}
                      className="text-xs text-nord-gray hover:text-amber-400 flex items-center gap-1"
                    >
                      <AlertTriangle size={12} /> Informar problema
                    </button>
                  )}
                </div>
              )}
              {isDone && resp?.observacao && <p className="text-xs text-amber-300">Observação: {resp.observacao}</p>}
            </div>
          );
        })}
      </div>

      {!isDone && (
        <div className="fixed bottom-0 left-0 right-0 bg-nord-black/95 backdrop-blur border-t border-nord-border p-3 z-20">
          <div className="max-w-lg mx-auto flex gap-2">
            <button
              onClick={() => router.push("/portal/tarefas/checklist")}
              className="px-4 py-3 rounded-lg text-sm border border-nord-border text-nord-gray"
            >
              Voltar
            </button>
            <button
              onClick={conclude}
              disabled={completing}
              className="flex-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2"
            >
              {completing && <Loader2 size={14} className="animate-spin" />}
              Concluir checklist
            </button>
          </div>
        </div>
      )}

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
