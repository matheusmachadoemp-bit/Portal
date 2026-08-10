"use client";

import { useMemo, useRef, useState } from "react";
import { Upload, Search, Trash2, File as FileIcon } from "lucide-react";
import { UniversityTabs } from "../university-tabs";
import { ConfirmDialog } from "@/components/ui/modal";
import { LIBRARY_CATEGORY_OPTIONS } from "@/lib/university";

type LibraryItem = {
  id: string;
  name: string;
  category: string;
  fileUrl: string;
  tags: string | null;
  createdAt: string;
  uploadedBy: { name: string };
};

const isImage = (url: string) => /\.(png|jpe?g|webp|gif)$/i.test(url);

export function LibraryClient({ initialItems }: { initialItems: LibraryItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState(LIBRARY_CATEGORY_OPTIONS[0]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    return items.filter((f) => {
      if (activeCategory && f.category !== activeCategory) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return f.name.toLowerCase().includes(q) || (f.tags ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [items, query, activeCategory]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of items) map.set(f.category, (map.get(f.category) ?? 0) + 1);
    return map;
  }, [items]);

  async function refresh() {
    const res = await fetch("/api/university/library");
    const data = await res.json();
    setItems(data.items);
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploaded = await uploadRes.json();
      if (!uploaded.fileUrl) continue;
      await fetch("/api/university/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: uploaded.fileName ?? file.name,
          category: uploadCategory,
          fileUrl: uploaded.fileUrl,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
        }),
      });
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/university/library/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <UniversityTabs />

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
        <div className="flex items-center gap-2">
          <select
            value={uploadCategory}
            onChange={(e) => setUploadCategory(e.target.value)}
            className="bg-nord-panel border border-nord-border rounded-lg px-2 py-2 text-xs text-white outline-none"
          >
            {LIBRARY_CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium cursor-pointer">
            <Upload size={13} /> {uploading ? "Enviando..." : "Enviar material"}
            <input ref={inputRef} type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium ${!activeCategory ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"}`}
        >
          Todos ({items.length})
        </button>
        {LIBRARY_CATEGORY_OPTIONS.filter((c) => counts.has(c)).map((c) => (
          <button
            key={c}
            onClick={() => setActiveCategory(c)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${activeCategory === c ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"}`}
          >
            {c} ({counts.get(c)})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {filtered.map((f) => (
          <div key={f.id} className="nord-card p-2 group relative">
            <a href={f.fileUrl} target="_blank" rel="noreferrer" className="block">
              {isImage(f.fileUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.fileUrl} alt={f.name} className="w-full h-24 object-cover rounded" />
              ) : (
                <div className="w-full h-24 rounded bg-nord-panel flex items-center justify-center">
                  <FileIcon size={22} className="text-nord-gray" />
                </div>
              )}
              <p className="text-[11px] text-white truncate mt-1.5">{f.name}</p>
              <p className="text-[10px] text-nord-gray">{f.category} · {new Date(f.createdAt).toLocaleDateString("pt-BR")}</p>
              <p className="text-[10px] text-nord-gray truncate">{f.uploadedBy.name}</p>
            </a>
            <button
              onClick={() => setConfirmDeleteId(f.id)}
              className="absolute top-2 right-2 p-1 rounded bg-black/60 text-nord-gray hover:text-red-400 opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {filtered.length === 0 && <p className="col-span-full text-center text-sm text-nord-gray py-8">Nenhum material encontrado.</p>}
      </div>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir material"
        message="Tem certeza que deseja excluir este material da biblioteca?"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />
    </div>
  );
}
