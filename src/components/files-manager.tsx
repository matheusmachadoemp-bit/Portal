"use client";

import { useMemo, useState } from "react";
import { FolderPlus, Upload, Trash2, Copy, Download, Folder, Search } from "lucide-react";
import { DynamicIcon } from "@/components/dynamic-icon";
import { Section } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { format } from "date-fns";

type FileDTO = {
  id: string;
  name: string;
  parentId: string | null;
  isFolder: boolean;
  fileUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  version: number;
  createdAt: string;
  createdBy: { name: string };
};

function iconFor(mimeType: string | null) {
  if (!mimeType) return "File";
  if (mimeType.includes("pdf")) return "FileText";
  if (mimeType.includes("image")) return "Image";
  if (mimeType.includes("video")) return "Video";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "Sheet";
  return "File";
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesManager({
  folderType,
  initialFiles,
}: {
  folderType: "ARQUIVO" | "CARTILHA" | "LOGO";
  initialFiles: FileDTO[];
}) {
  const [files, setFiles] = useState(initialFiles);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const visible = useMemo(() => {
    return files
      .filter((f) => f.parentId === currentFolder)
      .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
  }, [files, currentFolder, search]);

  async function refresh() {
    const res = await fetch(`/api/admin/files?folderType=${folderType}`);
    const data = await res.json();
    setFiles(data.files);
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    await fetch("/api/admin/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFolderName,
        folderType,
        parentId: currentFolder,
        isFolder: true,
      }),
    });
    setNewFolderName("");
    setShowNewFolder(false);
    refresh();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();

      await fetch("/api/admin/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: uploadData.fileName,
          folderType,
          parentId: currentFolder,
          isFolder: false,
          fileUrl: uploadData.fileUrl,
          mimeType: uploadData.mimeType,
          sizeBytes: uploadData.sizeBytes,
        }),
      });
      refresh();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function duplicateFile(f: FileDTO) {
    await fetch("/api/admin/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${f.name} (cópia)`,
        folderType,
        parentId: f.parentId,
        isFolder: f.isFolder,
        fileUrl: f.fileUrl,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
      }),
    });
    refresh();
  }

  async function renameFile(f: FileDTO) {
    const name = prompt("Novo nome:", f.name);
    if (!name) return;
    await fetch(`/api/admin/files/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/admin/files/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  function openFolder(f: FileDTO) {
    setCurrentFolder(f.id);
    setBreadcrumb((b) => [...b, { id: f.id, name: f.name }]);
  }

  function goToBreadcrumb(index: number) {
    if (index === -1) {
      setCurrentFolder(null);
      setBreadcrumb([]);
      return;
    }
    const target = breadcrumb[index];
    setCurrentFolder(target.id);
    setBreadcrumb(breadcrumb.slice(0, index + 1));
  }

  return (
    <Section
      title="Gerenciador de arquivos"
      action={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="bg-nord-panel border border-nord-border rounded-lg pl-7 pr-2 py-1.5 text-xs text-white outline-none focus:border-nord-blue w-40"
            />
          </div>
          <button
            onClick={() => setShowNewFolder(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white"
          >
            <FolderPlus size={13} /> Nova pasta
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium cursor-pointer">
            <Upload size={13} /> {uploading ? "Enviando..." : "Enviar arquivo"}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      }
    >
      <div className="flex items-center gap-1 text-xs text-nord-gray mb-4">
        <button onClick={() => goToBreadcrumb(-1)} className="hover:text-white">
          Raiz
        </button>
        {breadcrumb.map((b, i) => (
          <span key={b.id} className="flex items-center gap-1">
            <span>/</span>
            <button onClick={() => goToBreadcrumb(i)} className="hover:text-white">
              {b.name}
            </button>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {visible.map((f) => (
          <div key={f.id} className="nord-card p-3 flex flex-col gap-2 group">
            <button
              onClick={() => (f.isFolder ? openFolder(f) : window.open(f.fileUrl ?? "#", "_blank"))}
              className="flex flex-col items-center gap-2 py-3"
            >
              <DynamicIcon
                name={f.isFolder ? "Folder" : iconFor(f.mimeType)}
                size={32}
                className={f.isFolder ? "text-nord-blue-light" : "text-nord-gray"}
              />
              <span className="text-xs text-white text-center truncate w-full px-1">{f.name}</span>
            </button>
            <div className="flex items-center justify-between text-[10px] text-nord-gray px-1">
              <span>{f.isFolder ? "Pasta" : formatBytes(f.sizeBytes)}</span>
              <span>v{f.version}</span>
            </div>
            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition">
              {!f.isFolder && f.fileUrl && (
                <a href={f.fileUrl} download className="text-nord-gray hover:text-white">
                  <Download size={12} />
                </a>
              )}
              <button onClick={() => renameFile(f)} className="text-nord-gray hover:text-white text-[10px]">
                Renomear
              </button>
              <button onClick={() => duplicateFile(f)} className="text-nord-gray hover:text-white">
                <Copy size={12} />
              </button>
              <button onClick={() => setConfirmDeleteId(f.id)} className="text-nord-gray hover:text-red-400">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div className="col-span-full py-10 text-center text-nord-gray text-sm flex flex-col items-center gap-2">
            <Folder size={28} className="opacity-40" />
            Nenhum arquivo nesta pasta ainda.
          </div>
        )}
      </div>

      <Modal open={showNewFolder} onClose={() => setShowNewFolder(false)} title="Nova pasta" widthClass="max-w-sm">
        <input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="Nome da pasta"
          className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-nord-blue mb-3"
        />
        <button
          onClick={createFolder}
          className="w-full bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5"
        >
          Criar pasta
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir item"
        message="Tem certeza que deseja excluir este item? Se for uma pasta, todo o conteúdo será removido."
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />
    </Section>
  );
}
