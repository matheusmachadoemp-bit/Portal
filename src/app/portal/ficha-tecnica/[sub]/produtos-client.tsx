"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatCurrency, formatPercent } from "@/lib/calc";
import { cmvPercent, margemBrutaPercent, margemContribuicao, productTotalCost } from "@/lib/ficha";

type IngredientOption = {
  id: string;
  name: string;
  unidade: string;
  precoAtual: number;
  quantidadeEmbalagem: number;
};

type ProductDTO = {
  id: string;
  name: string;
  code: string;
  category: string;
  description: string | null;
  rendimento: string | null;
  tamanho: string | null;
  pesoFinal: number | null;
  precoVenda: number;
  modoPreparo: string | null;
  tempoPreparo: number | null;
  validade: string | null;
  responsavel: string | null;
  updatedAt: string;
  ingredients: {
    id: string;
    quantidadeUsada: number;
    percentualPerda: number;
    ingredient: IngredientOption;
  }[];
};

type IngredientLine = { ingredientId: string; quantidadeUsada: string; percentualPerda: string };

const emptyForm = {
  name: "",
  code: "",
  description: "",
  rendimento: "",
  tamanho: "",
  pesoFinal: "",
  precoVenda: "",
  modoPreparo: "",
  tempoPreparo: "",
  validade: "",
  responsavel: "",
};

export function ProdutosClient({
  initialProducts,
  ingredientOptions,
  category,
  canCreate = true,
}: {
  initialProducts: ProductDTO[];
  ingredientOptions: IngredientOption[];
  category: string;
  canCreate?: boolean;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProductDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<IngredientLine[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/ficha-tecnica/produtos?category=${category}`);
    const data = await res.json();
    setProducts(data.products);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setLines([{ ingredientId: ingredientOptions[0]?.id ?? "", quantidadeUsada: "", percentualPerda: "0" }]);
    setShowForm(true);
  }

  function openEdit(p: ProductDTO) {
    setEditing(p);
    setForm({
      name: p.name,
      code: p.code,
      description: p.description ?? "",
      rendimento: p.rendimento ?? "",
      tamanho: p.tamanho ?? "",
      pesoFinal: p.pesoFinal ? String(p.pesoFinal) : "",
      precoVenda: String(p.precoVenda),
      modoPreparo: p.modoPreparo ?? "",
      tempoPreparo: p.tempoPreparo ? String(p.tempoPreparo) : "",
      validade: p.validade ?? "",
      responsavel: p.responsavel ?? "",
    });
    setLines(
      p.ingredients.map((pi) => ({
        ingredientId: pi.ingredient.id,
        quantidadeUsada: String(pi.quantidadeUsada),
        percentualPerda: String(pi.percentualPerda),
      }))
    );
    setShowForm(true);
  }

  function addLine() {
    setLines((l) => [...l, { ingredientId: ingredientOptions[0]?.id ?? "", quantidadeUsada: "", percentualPerda: "0" }]);
  }

  function removeLine(idx: number) {
    setLines((l) => l.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, patch: Partial<IngredientLine>) {
    setLines((l) => l.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  }

  const previewCost = useMemo(() => {
    return lines.reduce((acc, line) => {
      const ing = ingredientOptions.find((o) => o.id === line.ingredientId);
      if (!ing) return acc;
      const costPerUnit = ing.quantidadeEmbalagem ? ing.precoAtual / ing.quantidadeEmbalagem : 0;
      const perda = 1 + (Number(line.percentualPerda) || 0) / 100;
      return acc + costPerUnit * (Number(line.quantidadeUsada) || 0) * perda;
    }, 0);
  }, [lines, ingredientOptions]);

  const previewPrecoVenda = Number(form.precoVenda) || 0;

  async function submit() {
    const payload = { ...form, category, ingredients: lines.filter((l) => l.ingredientId && l.quantidadeUsada) };
    if (editing) {
      await fetch(`/api/ficha-tecnica/produtos/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/ficha-tecnica/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setShowForm(false);
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/ficha-tecnica/produtos/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <Section
      title="Produtos cadastrados"
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
      {!canCreate && (
        <p className="mb-4 text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
          cadastrar ou editar fichas técnicas.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {products.map((p) => {
          const totalCost = productTotalCost(p.ingredients);
          const cmv = cmvPercent(totalCost, p.precoVenda);
          const margem = margemContribuicao(totalCost, p.precoVenda);
          const margemPct = margemBrutaPercent(totalCost, p.precoVenda);
          return (
            <div key={p.id} className="nord-card p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-nord-gray">
                    {p.code} • {p.tamanho}
                  </p>
                </div>
                <Badge tone={cmv > 35 ? "danger" : cmv > 28 ? "warning" : "success"}>
                  CMV {formatPercent(cmv)}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-nord-gray">
                <span>Preço venda: <span className="text-white">{formatCurrency(p.precoVenda)}</span></span>
                <span>Custo total: <span className="text-white">{formatCurrency(totalCost)}</span></span>
                <span>Margem: <span className="text-white">{formatCurrency(margem)}</span></span>
                <span>Margem %: <span className="text-white">{formatPercent(margemPct)}</span></span>
              </div>
              <div className="text-xs text-nord-gray">
                {p.ingredients.length} ingrediente(s) • {p.tempoPreparo ?? "-"} min preparo
              </div>
              <div className={`flex items-center gap-2 pt-2 border-t border-nord-border/60 mt-1 ${!canCreate ? "hidden" : ""}`}>
                <button onClick={() => openEdit(p)} className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-white py-1.5">
                  <Pencil size={12} /> Editar
                </button>
                <button onClick={() => setConfirmDeleteId(p.id)} className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-red-400 py-1.5">
                  <Trash2 size={12} /> Excluir
                </button>
              </div>
            </div>
          );
        })}
        {products.length === 0 && (
          <p className="text-sm text-nord-gray col-span-full text-center py-10">
            Nenhum produto cadastrado nesta categoria ainda.
          </p>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar produto" : "Novo produto"} widthClass="max-w-2xl">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome do produto">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </Field>
          <Field label="Código">
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="input" />
          </Field>
          <Field label="Rendimento">
            <input value={form.rendimento} onChange={(e) => setForm({ ...form, rendimento: e.target.value })} className="input" />
          </Field>
          <Field label="Tamanho">
            <input value={form.tamanho} onChange={(e) => setForm({ ...form, tamanho: e.target.value })} className="input" />
          </Field>
          <Field label="Peso final (g)">
            <input type="number" value={form.pesoFinal} onChange={(e) => setForm({ ...form, pesoFinal: e.target.value })} className="input" />
          </Field>
          <Field label="Preço de venda (R$)">
            <input type="number" value={form.precoVenda} onChange={(e) => setForm({ ...form, precoVenda: e.target.value })} className="input" />
          </Field>
          <Field label="Tempo de preparo (min)">
            <input type="number" value={form.tempoPreparo} onChange={(e) => setForm({ ...form, tempoPreparo: e.target.value })} className="input" />
          </Field>
          <Field label="Validade">
            <input value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} className="input" />
          </Field>
          <div className="col-span-2">
            <Field label="Responsável pela ficha">
              <input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} className="input" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Descrição">
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input min-h-12" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Modo de preparo">
              <textarea value={form.modoPreparo} onChange={(e) => setForm({ ...form, modoPreparo: e.target.value })} className="input min-h-16" />
            </Field>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm text-white font-medium">Ingredientes</h4>
            <button onClick={addLine} className="text-xs text-nord-blue-light hover:underline">
              + adicionar ingrediente
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={line.ingredientId}
                  onChange={(e) => updateLine(idx, { ingredientId: e.target.value })}
                  className="input col-span-5"
                >
                  {ingredientOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.unidade})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Qtd."
                  value={line.quantidadeUsada}
                  onChange={(e) => updateLine(idx, { quantidadeUsada: e.target.value })}
                  className="input col-span-3"
                />
                <input
                  type="number"
                  placeholder="% perda"
                  value={line.percentualPerda}
                  onChange={(e) => updateLine(idx, { percentualPerda: e.target.value })}
                  className="input col-span-3"
                />
                <button onClick={() => removeLine(idx)} className="col-span-1 text-nord-gray hover:text-red-400">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-xs bg-nord-panel rounded-lg p-3 border border-nord-border">
            <span className="text-nord-gray">
              Custo total: <span className="text-white">{formatCurrency(previewCost)}</span>
            </span>
            <span className="text-nord-gray">
              CMV: <span className="text-white">{formatPercent(cmvPercent(previewCost, previewPrecoVenda))}</span>
            </span>
            <span className="text-nord-gray">
              Margem: <span className="text-white">{formatCurrency(margemContribuicao(previewCost, previewPrecoVenda))}</span>
            </span>
          </div>
        </div>

        <button onClick={submit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar ficha técnica
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir produto"
        message="Tem certeza que deseja excluir esta ficha técnica?"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />

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
    </Section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-nord-gray mb-1">{label}</span>
      {children}
    </label>
  );
}
