"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";

export type StockSectorDTO = {
  id: string;
  name: string;
  order: number;
  active: boolean;
};

const emptyForm = { id: "", name: "" };

export function SetoresClient({
  sectors,
  onSectorsChange,
  canCreate,
  canEdit,
  canDelete,
}: {
  /** Lista completa de setores (ativos e inativos) — o estado vive no ProdutosClient (componente
   *  pai da aba "Produtos" + aba "Setores"), mesmo padrão de `CategoriasClient`/`categories`: as
   *  opções de setor usadas nos dropdowns da aba "Produtos" e da aba "Categorias" são derivadas
   *  dessa mesma lista (só os ativos), então criar/editar/ativar/excluir um setor aqui precisa
   *  refletir nelas na hora, sem recarregar a página. */
  sectors: StockSectorDTO[];
  /** Chamado com a lista atualizada (buscada de novo da API) após qualquer criação/edição/exclusão. */
  onSectorsChange: (sectors: StockSectorDTO[]) => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/estoque/setores");
    const data = await res.json();
    onSectorsChange(data.sectors);
  }

  function openEdit(s: StockSectorDTO) {
    if (!canEdit) return;
    setForm({ id: s.id, name: s.name });
    setError(null);
    setShowForm(true);
  }

  async function submit() {
    if (submitting) return;
    const isEdit = !!form.id;
    if (isEdit ? !canEdit : !canCreate) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(isEdit ? `/api/estoque/setores/${form.id}` : "/api/estoque/setores", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível salvar o setor.");
        return;
      }
      setShowForm(false);
      setForm(emptyForm);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(s: StockSectorDTO) {
    if (!canEdit) return;
    await fetch(`/api/estoque/setores/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    const res = await fetch(`/api/estoque/setores/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? "Não foi possível excluir o setor.");
      return;
    }
    setDeleteError(null);
    refresh();
  }

  return (
    <Section
      title="Setores de estoque"
      action={
        <Toolbar
          onRefresh={refresh}
          onAdd={canCreate ? () => { setForm(emptyForm); setError(null); setShowForm(true); } : undefined}
          addLabel="Novo setor"
        />
      }
    >
      <p className="text-xs text-nord-gray mb-4">
        Setores organizam produtos, categorias e contagens de estoque (ex.: Cozinha, Bar, Estoque seco). Eles aparecem como
        opção ao cadastrar um produto ou iniciar uma contagem.
      </p>

      {deleteError && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-nord-danger/10 border border-nord-danger/30">
          <AlertTriangle size={14} className="text-nord-danger mt-0.5 shrink-0" />
          <p className="text-xs text-nord-danger">{deleteError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {sectors.map((s) => (
          <div key={s.id} className={`nord-card p-4 space-y-2 ${!s.active ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="text-white font-medium text-sm">{s.name}</span>
              <Badge tone={s.active ? "success" : "default"}>{s.active ? "Ativo" : "Inativo"}</Badge>
            </div>
            <div className="flex items-center justify-end gap-3 text-[11px] pt-1">
              {canEdit && (
                <>
                  <button onClick={() => openEdit(s)} className="text-nord-blue-light hover:underline">
                    Editar
                  </button>
                  <button onClick={() => toggleActive(s)} className="text-nord-blue-light hover:underline">
                    {s.active ? "Desativar" : "Ativar"}
                  </button>
                </>
              )}
              {canDelete && (
                <button
                  onClick={() => { setDeleteError(null); setConfirmDeleteId(s.id); }}
                  className="text-nord-danger hover:underline"
                >
                  Excluir
                </button>
              )}
            </div>
          </div>
        ))}
        {sectors.length === 0 && (
          <p className="text-sm text-nord-gray py-6 text-center md:col-span-2 xl:col-span-3">Nenhum setor cadastrado.</p>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? "Editar setor" : "Novo setor"} widthClass="max-w-sm">
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1.5">Nome</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Cozinha, Bar, Estoque seco..."
            />
          </label>
          {error && <p className="text-xs text-nord-danger">{error}</p>}
          <button onClick={submit} disabled={!form.name.trim() || submitting} className="btn-primary w-full py-2.5">
            {submitting ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir setor"
        message="Tem certeza que deseja excluir este setor? Essa ação não pode ser desfeita. Produtos e contagens que já usam este setor continuam normalmente — só deixa de aparecer como opção para novos cadastros."
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />
    </Section>
  );
}
