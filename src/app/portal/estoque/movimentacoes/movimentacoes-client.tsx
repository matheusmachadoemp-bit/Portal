"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import { isAbsoluteMovement, STOCK_MOVEMENT_LABEL, STOCK_MOVEMENT_TONE, STOCK_MOVEMENT_TYPES } from "@/lib/estoque";

type MovementDTO = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unidade: string;
  type: string;
  quantidade: number;
  estoqueApos: number;
  motivo: string | null;
  createdByName: string;
  createdAt: string;
};

type IngredientOption = { id: string; name: string; unidade: string; estoqueAtual: number };

const emptyForm = { ingredientId: "", type: "ENTRADA", quantidade: "", motivo: "" };

export function MovimentacoesClient({
  initialMovements,
  ingredients,
  canCreate,
}: {
  initialMovements: MovementDTO[];
  ingredients: IngredientOption[];
  canCreate: boolean;
}) {
  const [movements, setMovements] = useState(initialMovements);
  const [ingredientFilter, setIngredientFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      movements.filter((m) => {
        if (ingredientFilter && m.ingredientId !== ingredientFilter) return false;
        if (typeFilter && m.type !== typeFilter) return false;
        return true;
      }),
    [movements, ingredientFilter, typeFilter]
  );

  async function refresh() {
    const res = await fetch("/api/estoque/movimentos");
    const data = await res.json();
    setMovements(
      data.movements.map((m: { id: string; ingredientId: string; ingredient: { name: string; unidade: string }; type: string; quantidade: number; estoqueApos: number; motivo: string | null; createdBy: { name: string }; createdAt: string }) => ({
        id: m.id,
        ingredientId: m.ingredientId,
        ingredientName: m.ingredient.name,
        unidade: m.ingredient.unidade,
        type: m.type,
        quantidade: m.quantidade,
        estoqueApos: m.estoqueApos,
        motivo: m.motivo,
        createdByName: m.createdBy.name,
        createdAt: m.createdAt,
      }))
    );
  }

  async function submit() {
    setError(null);
    const res = await fetch("/api/estoque/movimentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Não foi possível registrar a movimentação.");
      return;
    }
    setShowForm(false);
    setForm(emptyForm);
    refresh();
  }

  return (
    <Section
      title="Histórico de movimentações"
      action={
        canCreate ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Registrar movimentação
          </button>
        ) : undefined
      }
    >
      {!canCreate && (
        <p className="mb-4 text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
          registrar movimentações.
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <select value={ingredientFilter} onChange={(e) => setIngredientFilter(e.target.value)} className="input w-56">
          <option value="">Todos os insumos</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input w-44">
          <option value="">Todos os tipos</option>
          {STOCK_MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {STOCK_MOVEMENT_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Data</th>
              <th className="py-2 pr-4">Insumo</th>
              <th className="py-2 pr-4">Tipo</th>
              <th className="py-2 pr-4">Quantidade</th>
              <th className="py-2 pr-4">Estoque após</th>
              <th className="py-2 pr-4">Motivo</th>
              <th className="py-2 pr-4">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 pr-4 text-nord-gray">{format(new Date(m.createdAt), "dd/MM/yyyy HH:mm")}</td>
                <td className="py-2.5 pr-4 text-white">{m.ingredientName}</td>
                <td className="py-2.5 pr-4">
                  <Badge tone={STOCK_MOVEMENT_TONE[m.type as keyof typeof STOCK_MOVEMENT_TONE]}>{STOCK_MOVEMENT_LABEL[m.type as keyof typeof STOCK_MOVEMENT_LABEL]}</Badge>
                </td>
                <td className="py-2.5 pr-4 text-nord-gray">
                  {formatNumber(m.quantidade)} {m.unidade}
                </td>
                <td className="py-2.5 pr-4 text-nord-gray">
                  {formatNumber(m.estoqueApos)} {m.unidade}
                </td>
                <td className="py-2.5 pr-4 text-nord-gray">{m.motivo ?? "-"}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{m.createdByName}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-nord-gray">
                  Nenhuma movimentação encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Registrar movimentação" widthClass="max-w-sm">
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Insumo</span>
            <select value={form.ingredientId} onChange={(e) => setForm({ ...form, ingredientId: e.target.value })} className="input">
              <option value="">Selecione...</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} (estoque atual: {formatNumber(i.estoqueAtual)} {i.unidade})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Tipo de movimentação</span>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
              {STOCK_MOVEMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {STOCK_MOVEMENT_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">
              {isAbsoluteMovement(form.type) ? "Quantidade contada (valor final do estoque)" : "Quantidade"}
            </span>
            <input type="number" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Motivo / observação (opcional)</span>
            <input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} className="input" />
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={submit}
            disabled={!form.ingredientId || !form.quantidade}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            Registrar
          </button>
        </div>
      </Modal>

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
