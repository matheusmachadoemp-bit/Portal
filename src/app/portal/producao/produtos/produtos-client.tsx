"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { PRODUCTION_ITEM_TYPE_LABEL, PRODUCTION_ITEM_TYPE_OPTIONS, PRODUCTION_PRIORITY_OPTIONS } from "@/lib/producao";
import type { CategoriaOption, ProductionItemDTO } from "../types";

type IngredientOption = { id: string; name: string; unidade: string };
type IngredienteLine = { key: string; ingredientId: string; quantidadeUsada: string; unidade: string };

const emptyForm = {
  name: "",
  categoryId: "",
  unidade: "kg",
  descricao: "",
  tipo: "VARIAVEL",
  quantidadeMinima: "0",
  margemSeguranca: "0",
  tamanhoLote: "",
  validadeDias: "",
  horarioLimitePadrao: "15:00",
  prioridadePadrao: "NORMAL",
  ingredientId: "",
};

function newLineKey() {
  return Math.random().toString(36).slice(2);
}

export function ProdutosClient({
  initialItens,
  categorias,
  ingredientOptions,
  canCreate = true,
}: {
  initialItens: ProductionItemDTO[];
  categorias: CategoriaOption[];
  ingredientOptions: IngredientOption[];
  canCreate?: boolean;
}) {
  const [itens, setItens] = useState(initialItens);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProductionItemDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<IngredienteLine[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const res = await fetch("/api/producao/itens");
    const data = await res.json();
    setItens(data.itens);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, categoryId: categorias[0]?.id ?? "" });
    setLines([]);
    setError(null);
    setShowForm(true);
  }

  function openEdit(item: ProductionItemDTO) {
    setEditing(item);
    setForm({
      name: item.name,
      categoryId: item.category.id,
      unidade: item.unidade,
      descricao: item.descricao ?? "",
      tipo: item.tipo,
      quantidadeMinima: String(item.quantidadeMinima),
      margemSeguranca: String(item.margemSeguranca),
      tamanhoLote: item.tamanhoLote ? String(item.tamanhoLote) : "",
      validadeDias: item.validadeDias ? String(item.validadeDias) : "",
      horarioLimitePadrao: item.horarioLimitePadrao ?? "15:00",
      prioridadePadrao: item.prioridadePadrao,
      ingredientId: item.ingredientId ?? "",
    });
    setLines(
      item.ingredientes.map((ing) => ({
        key: newLineKey(),
        ingredientId: ing.ingredientId,
        quantidadeUsada: String(ing.quantidadeUsada),
        unidade: ing.unidade,
      }))
    );
    setError(null);
    setShowForm(true);
  }

  function addLine() {
    setLines((l) => [...l, { key: newLineKey(), ingredientId: ingredientOptions[0]?.id ?? "", quantidadeUsada: "", unidade: "g" }]);
  }
  function removeLine(key: string) {
    setLines((l) => l.filter((line) => line.key !== key));
  }
  function updateLine(key: string, patch: Partial<IngredienteLine>) {
    setLines((l) => l.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function submit() {
    if (saving) return;
    if (!form.name || !form.categoryId) {
      setError("Nome e categoria são obrigatórios.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      ingredientId: form.ingredientId || null,
      ingredientes: lines.filter((l) => l.ingredientId && l.quantidadeUsada),
    };
    try {
      const res = await fetch(editing ? `/api/producao/itens/${editing.id}` : "/api/producao/itens", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Não foi possível salvar o produto de produção.");
        return;
      }
      setShowForm(false);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/producao/itens/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <Section
      title="Produtos de produção cadastrados"
      action={
        canCreate ? (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Novo produto
          </button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {itens.map((item) => (
          <div key={item.id} className="nord-card p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <DynamicIcon name={item.category.icon} size={16} style={{ color: item.category.color }} />
                <p className="text-white font-medium text-sm truncate">{item.name}</p>
              </div>
              <Badge tone={item.tipo === "FIXO" ? "info" : "default"}>{PRODUCTION_ITEM_TYPE_LABEL[item.tipo]?.split(" ")[0]}</Badge>
            </div>
            <p className="text-xs text-nord-gray">{item.category.name}</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-nord-gray">
              <span>
                Estoque pronto: <span className="text-white">{item.stock?.saldoAtual ?? 0} {item.unidade}</span>
              </span>
              <span>
                Margem: <span className="text-white">{item.margemSeguranca}%</span>
              </span>
              {item.tamanhoLote && (
                <span>
                  Lote: <span className="text-white">{item.tamanhoLote} {item.unidade}</span>
                </span>
              )}
              {item.tipo === "FIXO" && (
                <span>
                  Mínimo: <span className="text-white">{item.quantidadeMinima} {item.unidade}</span>
                </span>
              )}
            </div>
            {canCreate && (
              <div className="flex items-center gap-2 pt-2 border-t border-nord-border/60 mt-1">
                <button onClick={() => openEdit(item)} className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-white py-1.5">
                  <Pencil size={12} /> Editar
                </button>
                <button onClick={() => setConfirmDeleteId(item.id)} className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-red-400 py-1.5">
                  <Trash2 size={12} /> Excluir
                </button>
              </div>
            )}
          </div>
        ))}
        {itens.length === 0 && <p className="text-sm text-nord-gray col-span-full text-center py-10">Nenhum produto de produção cadastrado ainda.</p>}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar produto de produção" : "Novo produto de produção"} widthClass="max-w-2xl">
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Categoria</span>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="input">
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Unidade</span>
            <input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Tipo de produção</span>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="input">
              {PRODUCTION_ITEM_TYPE_OPTIONS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Prioridade padrão</span>
            <select value={form.prioridadePadrao} onChange={(e) => setForm({ ...form, prioridadePadrao: e.target.value })} className="input">
              {PRODUCTION_PRIORITY_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {form.tipo === "FIXO" && (
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Quantidade mínima diária</span>
              <input value={form.quantidadeMinima} onChange={(e) => setForm({ ...form, quantidadeMinima: e.target.value })} className="input" />
            </label>
          )}
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Margem de segurança (%)</span>
            <input value={form.margemSeguranca} onChange={(e) => setForm({ ...form, margemSeguranca: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Tamanho do lote (opcional)</span>
            <input value={form.tamanhoLote} onChange={(e) => setForm({ ...form, tamanhoLote: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Validade (dias, opcional)</span>
            <input value={form.validadeDias} onChange={(e) => setForm({ ...form, validadeDias: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Horário limite padrão</span>
            <input type="time" value={form.horarioLimitePadrao} onChange={(e) => setForm({ ...form, horarioLimitePadrao: e.target.value })} className="input" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Ligar a um insumo da ficha técnica (opcional)</span>
            <select value={form.ingredientId} onChange={(e) => setForm({ ...form, ingredientId: e.target.value })} className="input">
              <option value="">Nenhum (não entra na previsão automática)</option>
              {ingredientOptions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <span className="block text-[11px] text-nord-gray mt-1">
              Ligue ao insumo que os produtos vendidos usam na ficha técnica (ex.: &quot;Frango Desfiado&quot;) para que a
              previsão de vendas calcule a necessidade automaticamente.
            </span>
          </label>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-nord-gray">Insumos usados na produção</span>
            <button onClick={addLine} className="flex items-center gap-1 text-xs text-nord-blue-light hover:underline">
              <Plus size={12} /> Adicionar insumo
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.key} className="flex items-center gap-2">
                <select
                  value={line.ingredientId}
                  onChange={(e) => updateLine(line.key, { ingredientId: e.target.value })}
                  className="input flex-1"
                >
                  {ingredientOptions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <input
                  value={line.quantidadeUsada}
                  onChange={(e) => updateLine(line.key, { quantidadeUsada: e.target.value })}
                  placeholder="Qtd."
                  className="input w-20"
                />
                <input
                  value={line.unidade}
                  onChange={(e) => updateLine(line.key, { unidade: e.target.value })}
                  placeholder="un."
                  className="input w-16"
                />
                <button onClick={() => removeLine(line.key)} className="text-nord-gray hover:text-red-400">
                  <X size={14} />
                </button>
              </div>
            ))}
            {lines.length === 0 && <p className="text-xs text-nord-gray">Nenhum insumo adicionado ainda.</p>}
          </div>
        </div>

        <button
          onClick={submit}
          disabled={saving}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir produto de produção"
        message="Isso desativa o produto de produção (o histórico de ordens já geradas é mantido). Deseja continuar?"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        danger
      />
    </Section>
  );
}
