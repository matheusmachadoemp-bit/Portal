"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Save, ExternalLink } from "lucide-react";
import { MarketingTabs } from "../marketing-tabs";
import { Section } from "@/components/ui/stat-card";

function toEmbedUrl(url: string) {
  // Google Drive folder/file links can be embedded directly with /preview or /embeddedfolderview
  if (url.includes("/folders/")) {
    const id = url.split("/folders/")[1]?.split(/[?/]/)[0];
    if (id) return `https://drive.google.com/embeddedfolderview?id=${id}#grid`;
  }
  return url;
}

export function DriveClient({ driveFolderUrl, canEdit }: { driveFolderUrl: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState(driveFolderUrl ?? "");
  const [editing, setEditing] = useState(!driveFolderUrl);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/marketing/drive-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveFolderUrl: url }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <MarketingTabs />

      <Section
        title="Pasta do Google Drive"
        action={
          canEdit && !editing ? (
            <button onClick={() => setEditing(true)} className="text-xs text-nord-blue-light hover:text-white">
              Alterar link
            </button>
          ) : undefined
        }
      >
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Cole o link de compartilhamento da pasta do Google Drive..."
              className="flex-1 bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
            />
            <button
              onClick={save}
              disabled={saving || !url.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
            >
              <Save size={13} /> Salvar
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-white">
              <FolderOpen size={16} className="text-nord-blue-light" />
              <span className="truncate max-w-md">{url}</span>
            </div>
            <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-nord-blue-light hover:text-white">
              Abrir no Drive <ExternalLink size={12} />
            </a>
          </div>
        )}
        <p className="text-xs text-nord-gray mt-3">
          A pasta precisa estar compartilhada como &quot;Qualquer pessoa com o link pode visualizar&quot; para aparecer
          incorporada abaixo. Esta integração usa o link de compartilhamento público — não substitui uma integração
          OAuth completa com a API do Google Drive.
        </p>
      </Section>

      {url && !editing && (
        <div className="nord-card p-2 overflow-hidden">
          <iframe src={toEmbedUrl(url)} className="w-full h-[600px] rounded-lg border-0" title="Google Drive" />
        </div>
      )}
    </div>
  );
}
