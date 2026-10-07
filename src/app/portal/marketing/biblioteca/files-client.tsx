"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Upload, Search, Trash2, File as FileIcon, CheckCircle2, Circle } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { ConfirmDialog } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";
import { FILE_CATEGORY_OPTIONS } from "@/lib/marketing";

type FileDTO = {
  id: string;
  name: string;
  category: string;
  lancado: boolean;
  fileUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
  tags: string | null;
  createdAt: string;
  uploadedBy: { name: string };
  empresa: { name: string };
};

const isImage = (url: string) => /\.(png|jpe?g|webp|gif)$/i.test(url);

export function FilesClient({
  initialFiles,
  canCreate,
  canDelete,
  canEdit = false,
  space = "biblioteca",
}: {
  initialFiles: FileDTO[];
  canCreate: boolean;
  canDelete: boolean;
  canEdit?: boolean;
  space?: "biblioteca" | "drive";
}) {
  const [files, setFiles] = useState(initialFiles);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"todos" | "lancado" | "nao-lancado">("todos");
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState(FILE_CATEGORY_OPTIONS[0]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    return files.filter((f) => {
      if (activeCategory && f.category !== activeCategory) return false;
      if (statusFilter === "lancado" && !f.lancado) return false;
      if (statusFilter === "nao-lancado" && f.lancado) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return f.name.toLowerCase().includes(q) || (f.tags ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [files, query, activeCategory, statusFilter]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of files) {
      if (statusFilter === "lancado" && !f.lancado) continue;
      if (statusFilter === "nao-lancado" && f.lancado) continue;
      map.set(f.category, (map.get(f.category) ?? 0) + 1);
    }
    return map;
  }, [files, statusFilter]);

  const totalNoStatus = useMemo(
    () => Array.from(counts.values()).reduce((a, b) => a + b, 0),
    [counts]
  );

  async function refresh() {
    const res = await fetch(`/api/marketing/files?space=${space}`);
    const data = await res.json();
    setFiles(data.files);
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(fileList)) {
        const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
        const result = await apiRequest("/api/marketing/files", "POST", {
          name: file.name,
          space,
          category: uploadCategory,
          fileUrl: blob.url,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        if (!result.ok) {
          setUploadError(result.error);
          return;
        }
      }
      refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha ao enviar o arquivo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function toggleLancado(f: FileDTO) {
    if (pendingIds.has(f.id)) return;
    setToggleError(null);
    const next = !f.lancado;
    setPendingIds((prev) => new Set(prev).add(f.id));
    // Atualiza na hora; se a API recusar, volta ao valor anterior.
    setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, lancado: next } : x)));
    const result = await apiRequest(`/api/marketing/files/${f.id}`, "PATCH", { lancado: next });
    if (!result.ok) {
      setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, lancado: f.lancado } : x)));
      setToggleError(result.error);
    }
    setPendingIds((prev) => {
      const copy = new Set(prev);
      copy.delete(f.id);
      return copy;
    });
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    setDeleteError(null);
    const result = await apiRequest(`/api/marketing/files/${confirmDeleteId}`, "DELETE");
    if (!result.ok) {
      setDeleteError(result.error);
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nord-gray" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou tag..."
            className="w-full bg-nord-panel border border-nord-border rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
          />
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="bg-nord-panel border border-nord-border rounded-lg px-2 py-2 text-xs text-white outline-none"
            >
              {FILE_CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium cursor-pointer">
              <Upload size={13} /> {uploading ? "Enviando..." : "Enviar arquivo"}
              <input ref={inputRef} type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
            </label>
          </div>
        )}
      </div>

      {uploadError && <p className="text-xs text-nord-danger">{uploadError}</p>}
      {deleteError && <p className="text-xs text-nord-danger">{deleteError}</p>}
      {toggleError && <p className="text-xs text-nord-danger">{toggleError}</p>}

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium ${!activeCategory ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"}`}
        >
          Todas ({totalNoStatus})
        </button>
        {FILE_CATEGORY_OPTIONS.filter((c) => counts.has(c)).map((c) => (
          <button
            key={c}
            onClick={() => setActiveCategory(c)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${activeCategory === c ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"}`}
          >
            {c} ({counts.get(c)})
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 flex-wrap items-center">
        <span className="text-[11px] text-nord-gray mr-1">Status:</span>
        {([
          ["todos", "Todos"],
          ["lancado", "Lançados"],
          ["nao-lancado", "Não lançados"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${statusFilter === key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {filtered.map((f) => (
          <div key={f.id} className="nord-card p-2 group relative">
            <a href={f.fileUrl} target="_blank" rel="noreferrer" className="block">
              {isImage(f.fileUrl) ? (
                <div className="relative w-full h-24">
                  <Image src={f.fileUrl} alt={f.name} fill className="object-cover rounded" />
                </div>
              ) : (
                <div className="w-full h-24 rounded bg-nord-panel flex items-center justify-center">
                  <FileIcon size={22} className="text-nord-gray" />
                </div>
              )}
              <p className="text-[11px] text-white truncate mt-1.5">{f.name}</p>
              <p className="text-[10px] text-nord-gray">{f.category} · {new Date(f.createdAt).toLocaleDateString("pt-BR")}</p>
              <p className="text-[10px] text-nord-gray truncate">{f.uploadedBy.name}</p>
            </a>
            {canEdit ? (
              <button
                onClick={() => toggleLancado(f)}
                disabled={pendingIds.has(f.id)}
                aria-pressed={f.lancado}
                title={f.lancado ? "Marcar como não lançado" : "Marcar como lançado"}
                className={`mt-1.5 flex items-center gap-1 text-[10px] font-medium disabled:opacity-50 ${f.lancado ? "text-nord-success" : "text-nord-gray hover:text-white"}`}
              >
                {f.lancado ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                {f.lancado ? "Lançado" : "Não lançado"}
              </button>
            ) : (
              <p className={`mt-1.5 flex items-center gap-1 text-[10px] font-medium ${f.lancado ? "text-nord-success" : "text-nord-gray"}`}>
                {f.lancado ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                {f.lancado ? "Lançado" : "Não lançado"}
              </p>
            )}
            {canDelete && (
              <button
                onClick={() => setConfirmDeleteId(f.id)}
                className="absolute top-2 right-2 p-1 rounded bg-black/60 text-nord-gray hover:text-nord-danger opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-nord-gray py-8">Nenhum arquivo encontrado.</p>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir arquivo"
        message="Tem certeza que deseja excluir este arquivo da biblioteca?"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />
    </div>
  );
}
