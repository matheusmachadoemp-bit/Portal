"use client";

import { useMemo, useState } from "react";
import { Check, Info, MessageSquare, Plus, Repeat, Trash2, TriangleAlert } from "lucide-react";
import { formatCurrency } from "@/lib/calc";
import {
  AJUSTE_NAMES,
  DIVERGENCE_REASONS,
  ITEM_GROUPS,
  PRICE_SOURCE_LABEL,
  UNIT_SUGGESTIONS,
  closesWithBoleto,
  computeTotals,
  detailPercent,
  diffBreakdown,
  isAboveAgreed,
  itemKey,
  round2,
  type ItemKind,
  type PriceHint,
  type PriceSource,
} from "@/lib/compra-itens";

// ------------------------------------------------------------------------------------------------
// Tipos e conversões (a tela guarda tudo como texto digitado; o servidor valida de novo)
// ------------------------------------------------------------------------------------------------

export type DraftItem = {
  key: string;
  kind: ItemKind;
  ingredientId: string | null;
  nome: string;
  grupo: string;
  quantidade: string;
  unidade: string;
  /** Vazio = este item não tinha preço combinado. */
  precoCombinado: string;
  origemCombinado: PriceSource | null;
  precoCobrado: string;
};

export type IngredientOption = { id: string; name: string; unidade: string; unidadeCompra: string | null };

export type SavedItem = {
  kind: ItemKind;
  ingredientId: string | null;
  nome: string;
  grupo: string | null;
  quantidade: number;
  unidade: string;
  precoCombinado: number | null;
  origemCombinado: PriceSource | null;
  precoCobrado: number;
};

export type LastPurchase = { id: string; dataCompra: string; numeroNota: string | null; totalCobrado: number; itens: SavedItem[] };

export type DecisionState = {
  acao: "" | "ACEITAR" | "CONTESTAR";
  motivo: string;
  observacao: string;
};

export const EMPTY_DECISION: DecisionState = { acao: "", motivo: "", observacao: "" };

let counter = 0;
export function newKey() {
  counter += 1;
  return `it-${Date.now().toString(36)}-${counter}`;
}

function textOf(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

export function draftFromSaved(it: SavedItem): DraftItem {
  return {
    key: newKey(),
    kind: it.kind,
    ingredientId: it.ingredientId,
    nome: it.nome,
    grupo: it.grupo ?? "",
    quantidade: it.kind === "AJUSTE" ? "1" : textOf(it.quantidade),
    unidade: it.kind === "AJUSTE" ? "" : it.unidade,
    precoCombinado: textOf(it.precoCombinado),
    origemCombinado: it.origemCombinado,
    precoCobrado: textOf(it.precoCobrado),
  };
}

export function draftsToPayload(items: DraftItem[]) {
  return items.map((d) => ({
    kind: d.kind,
    ingredientId: d.kind === "INSUMO" ? d.ingredientId : null,
    nome: d.nome,
    grupo: d.kind === "OUTRO" ? d.grupo : null,
    quantidade: d.kind === "AJUSTE" ? 1 : d.quantidade,
    unidade: d.kind === "AJUSTE" ? "-" : d.unidade,
    precoCombinado: d.precoCombinado.trim() === "" ? null : d.precoCombinado,
    origemCombinado: d.precoCombinado.trim() === "" ? null : d.origemCombinado ?? "MANUAL",
    precoCobrado: d.precoCobrado,
  }));
}

function num(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Números de uma linha para os cálculos da tela (campo vazio ou inválido conta como 0 / sem combinado). */
function numeric(d: DraftItem) {
  const quantidade = d.kind === "AJUSTE" ? 1 : num(d.quantidade) ?? 0;
  const cobrado = num(d.precoCobrado) ?? 0;
  // Frete/desconto sem combinado contam como R$ 0,00 combinado (igual ao servidor): frete não combinado vira diferença.
  const combinado = num(d.precoCombinado) ?? (d.kind === "AJUSTE" ? 0 : null);
  return { kind: d.kind, quantidade, precoCombinado: combinado, precoCobrado: cobrado, total: round2(quantidade * cobrado) };
}

export function summarize(items: DraftItem[]) {
  const rows = items.map(numeric);
  return { rows, totals: computeTotals(rows), breakdown: diffBreakdown(rows) };
}

/** Itens novos já com o “combinado” sugerido pelo último preço pago a este fornecedor. */
export function newItemFromIngredient(ing: IngredientOption, hints: Record<string, PriceHint>): DraftItem {
  const unidade = ing.unidadeCompra || ing.unidade;
  const hint = hints[itemKey({ kind: "INSUMO", ingredientId: ing.id, nome: ing.name, unidade })] ?? hints[`i:${ing.id}`];
  return {
    key: newKey(),
    kind: "INSUMO",
    ingredientId: ing.id,
    nome: ing.name,
    grupo: "",
    quantidade: "",
    unidade,
    precoCombinado: hint ? String(hint.preco) : "",
    origemCombinado: hint ? hint.origem : null,
    precoCobrado: "",
  };
}

export function newOtherItem(nome = ""): DraftItem {
  return { key: newKey(), kind: "OUTRO", ingredientId: null, nome, grupo: "Embalagem", quantidade: "", unidade: "un", precoCombinado: "", origemCombinado: null, precoCobrado: "" };
}

export function newAdjustment(nome: string): DraftItem {
  return { key: newKey(), kind: "AJUSTE", ingredientId: null, nome, grupo: "", quantidade: "1", unidade: "", precoCombinado: "", origemCombinado: null, precoCobrado: "" };
}

function normalizeSearch(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function signed(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatCurrency(Math.abs(value))}`;
}

// ------------------------------------------------------------------------------------------------
// Componente
// ------------------------------------------------------------------------------------------------

export function CompraItensEditor({
  items,
  onItemsChange,
  ingredients,
  hints,
  lastPurchase,
  loadingHistory,
  valorBoleto,
  onUseTotal,
  decision,
  onDecisionChange,
  hadCompra,
  numeroNota,
  onNumeroNotaChange,
}: {
  items: DraftItem[];
  onItemsChange: (items: DraftItem[]) => void;
  ingredients: IngredientOption[];
  hints: Record<string, PriceHint>;
  lastPurchase: LastPurchase | null;
  loadingHistory: boolean;
  /** Valor digitado no campo “Valor (R$)” do boleto (0 se vazio). */
  valorBoleto: number;
  onUseTotal: (total: number) => void;
  decision: DecisionState;
  onDecisionChange: (d: DecisionState) => void;
  /** A conta já tinha itens gravados (se ficar sem nenhum, salvar remove os itens). */
  hadCompra: boolean;
  /** Número da nota fiscal / boleto do fornecedor (só é gravado junto com os itens). */
  numeroNota: string;
  onNumeroNotaChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [confirmRepeat, setConfirmRepeat] = useState(false);

  const { rows, totals, breakdown } = useMemo(() => summarize(items), [items]);
  const above = isAboveAgreed(totals);
  const pct = detailPercent(totals.totalCobrado, valorBoleto);
  const closes = valorBoleto > 0 && closesWithBoleto(totals.totalCobrado, valorBoleto);
  const gap = round2(valorBoleto - totals.totalCobrado);

  const matches = useMemo(() => {
    const q = normalizeSearch(query.trim());
    if (!q) return [];
    const words = q.split(/\s+/).filter(Boolean);
    return ingredients.filter((i) => {
      const name = normalizeSearch(i.name);
      return words.every((w) => name.includes(w));
    }).slice(0, 8);
  }, [ingredients, query]);

  function update(key: string, patch: Partial<DraftItem>) {
    onItemsChange(items.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }
  function remove(key: string) {
    onItemsChange(items.filter((d) => d.key !== key));
  }
  function add(item: DraftItem) {
    onItemsChange([...items, item]);
    setQuery("");
  }

  function repeatLast() {
    if (!lastPurchase) return;
    const copied = lastPurchase.itens.map((it) => {
      const draft = draftFromSaved(it);
      if (it.kind === "AJUSTE") return { ...draft, precoCobrado: textOf(it.precoCobrado) };
      const hint = hints[itemKey({ kind: it.kind, ingredientId: it.ingredientId, nome: it.nome, unidade: it.unidade })];
      const preco = hint ? hint.preco : it.precoCombinado ?? it.precoCobrado;
      // O preço de referência vira o combinado E o ponto de partida do cobrado: quem registra só corrige o que mudou.
      return { ...draft, precoCombinado: textOf(preco), origemCombinado: "ULTIMO_PRECO" as PriceSource, precoCobrado: textOf(preco) };
    });
    onItemsChange(copied);
    setConfirmRepeat(false);
  }

  return (
    <section className="col-span-2 rounded-lg border border-nord-border bg-nord-panel/40 p-3 space-y-3" aria-label="O que foi comprado">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            O que foi comprado
            <span className="text-[11px] font-medium rounded-full bg-white/10 text-nord-gray px-2 py-0.5">Opcional</span>
          </h3>
          <p className="text-xs text-nord-gray mt-0.5 max-w-xl">
            Liste os itens da nota para saber em quais produtos você gasta mais e se o fornecedor cobrou o que combinou.
            Não mexe no estoque.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!lastPurchase || loadingHistory}
            onClick={() => (items.length > 0 ? setConfirmRepeat(true) : repeatLast())}
            className="btn-outline !py-1.5 !px-2.5 !text-xs disabled:opacity-50"
            title={lastPurchase ? "Copia os itens da última compra deste fornecedor" : "Escolha um fornecedor que já tenha compra registrada"}
          >
            <Repeat size={13} /> Repetir última compra deste fornecedor
          </button>
        </div>
      </div>

      <label className="block max-w-xs">
        <span className="block text-xs text-nord-gray mb-1">Nº da nota ou do boleto do fornecedor (opcional)</span>
        <input value={numeroNota} onChange={(e) => onNumeroNotaChange(e.target.value)} maxLength={60} placeholder="Ex.: NF 48213" className="input" />
      </label>

      {confirmRepeat && (
        <div className="rounded-lg border border-nord-warning/30 bg-nord-warning/10 px-3 py-2 text-xs text-nord-warning flex flex-wrap items-center gap-2">
          <span>Isto troca os itens digitados pelos da última compra deste fornecedor. Continuar?</span>
          <button type="button" onClick={repeatLast} className="btn-outline !py-1 !px-2 !text-xs">Trocar itens</button>
          <button type="button" onClick={() => setConfirmRepeat(false)} className="text-nord-gray hover:text-white underline">Cancelar</button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-nord-gray rounded-lg border border-dashed border-nord-border px-3 py-3">
          {hadCompra
            ? "Sem itens: ao salvar, os itens que estavam gravados nesta conta serão removidos."
            : "Sem itens: esta conta não entra nos relatórios de gasto por produto. Você pode salvar assim e detalhar depois."}
        </p>
      ) : (
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-xs min-w-[820px]">
            <thead>
              <tr className="text-left text-nord-gray border-b border-nord-border">
                <th scope="col" className="py-1.5 pr-2 font-medium">Produto</th>
                <th scope="col" className="py-1.5 pr-2 font-medium w-20">Qtd</th>
                <th scope="col" className="py-1.5 pr-2 font-medium w-20">Un.</th>
                <th scope="col" className="py-1.5 pr-2 font-medium w-28">Combinado (R$/un.)</th>
                <th scope="col" className="py-1.5 pr-2 font-medium w-28">Cobrado (R$/un.)</th>
                <th scope="col" className="py-1.5 pr-2 font-medium text-right w-32">Diferença</th>
                <th scope="col" className="py-1.5 pr-2 font-medium text-right w-24">Total</th>
                <th scope="col" className="py-1.5 w-8"><span className="sr-only">Remover</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((d, i) => {
                const r = rows[i];
                const comb = r.precoCombinado;
                const cob = num(d.precoCobrado);
                const diff = comb !== null && cob !== null ? round2(cob - comb) : null;
                return (
                  <tr key={d.key} className="border-b border-nord-border/50 align-top">
                    <td className="py-1.5 pr-2">
                      {d.kind === "INSUMO" ? (
                        <div className="text-white text-sm leading-5">{d.nome}</div>
                      ) : d.kind === "OUTRO" ? (
                        <input
                          value={d.nome}
                          onChange={(e) => update(d.key, { nome: e.target.value })}
                          placeholder="Nome do item"
                          aria-label="Nome do item"
                          className="input-sm w-full"
                          maxLength={120}
                        />
                      ) : (
                        <input
                          value={d.nome}
                          list="compra-ajustes"
                          onChange={(e) => update(d.key, { nome: e.target.value })}
                          aria-label="Tipo de ajuste"
                          className="input-sm w-full"
                          maxLength={120}
                        />
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {d.kind === "INSUMO" && <span className="rounded px-1.5 py-px text-[11px] bg-nord-blue/25 text-white">Insumo</span>}
                        {d.kind === "AJUSTE" && <span className="rounded px-1.5 py-px text-[11px] bg-white/10 text-nord-gray">Ajuste</span>}
                        {d.kind === "OUTRO" && (
                          <>
                            <span className="rounded px-1.5 py-px text-[11px] bg-white/10 text-nord-gray">Outro item</span>
                            <select
                              value={d.grupo}
                              onChange={(e) => update(d.key, { grupo: e.target.value })}
                              aria-label="Grupo do item"
                              className="input-sm !py-0.5"
                            >
                              {!ITEM_GROUPS.includes(d.grupo as (typeof ITEM_GROUPS)[number]) && d.grupo && <option value={d.grupo}>{d.grupo}</option>}
                              {ITEM_GROUPS.map((g) => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2">
                      {d.kind === "AJUSTE" ? (
                        <span className="text-nord-gray">—</span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={d.quantidade}
                          onChange={(e) => update(d.key, { quantidade: e.target.value })}
                          aria-label={`Quantidade de ${d.nome || "item"}`}
                          className="input-sm w-full"
                        />
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      {d.kind === "AJUSTE" ? (
                        <span className="text-nord-gray">—</span>
                      ) : (
                        <input
                          value={d.unidade}
                          list="compra-unidades"
                          onChange={(e) => update(d.key, { unidade: e.target.value })}
                          aria-label={`Unidade de ${d.nome || "item"}`}
                          className="input-sm w-full"
                          maxLength={12}
                        />
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={d.precoCombinado}
                        placeholder={d.kind === "AJUSTE" ? "0" : "—"}
                        onChange={(e) =>
                          update(d.key, {
                            precoCombinado: e.target.value,
                            origemCombinado: e.target.value.trim() === "" ? null : "MANUAL",
                          })
                        }
                        aria-label={`Preço combinado de ${d.nome || "item"}`}
                        className="input-sm w-full"
                      />
                      <div className="mt-0.5 text-[11px] text-nord-gray leading-4">
                        {d.precoCombinado.trim() === ""
                          ? d.kind === "AJUSTE"
                            ? "Não combinado (R$ 0,00)"
                            : "Sem preço combinado"
                          : d.origemCombinado
                            ? PRICE_SOURCE_LABEL[d.origemCombinado]
                            : PRICE_SOURCE_LABEL.MANUAL}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={d.precoCobrado}
                        onChange={(e) => update(d.key, { precoCobrado: e.target.value })}
                        aria-label={`Valor cobrado de ${d.nome || "item"}`}
                        className="input-sm w-full"
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                      {diff === null ? (
                        <span className="text-nord-gray">—</span>
                      ) : Math.abs(diff) < 0.005 ? (
                        <span className="inline-flex items-center gap-1 text-nord-success"><Check size={12} /> igual</span>
                      ) : (
                        <span className={diff > 0 ? "text-nord-danger" : "text-nord-success"}>
                          {signed(diff)}
                          {comb !== null && comb > 0 && ` (${diff > 0 ? "+" : ""}${((diff / comb) * 100).toFixed(1).replace(".", ",")}%)`}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-white whitespace-nowrap">{formatCurrency(r.total)}</td>
                    <td className="py-1.5 text-right">
                      <button type="button" onClick={() => remove(d.key)} aria-label={`Remover ${d.nome || "item"}`} className="text-nord-gray hover:text-nord-danger p-1">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Adicionar */}
      <div className="space-y-2">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite para buscar um produto do estoque…"
            aria-label="Buscar produto para adicionar"
            className="input w-full"
            autoComplete="off"
          />
          {query.trim() && (
            <ul className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-nord-border bg-nord-card shadow-2xl max-h-56 overflow-y-auto nord-scrollbar">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => add(newItemFromIngredient(m, hints))}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 flex items-center justify-between gap-3"
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="text-[11px] text-nord-gray shrink-0">{m.unidadeCompra || m.unidade}</span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && <li className="px-3 py-2 text-xs text-nord-gray">Nenhum insumo encontrado com esse nome.</li>}
              <li className="border-t border-nord-border">
                <button
                  type="button"
                  onClick={() => add(newOtherItem(query.trim()))}
                  className="w-full text-left px-3 py-2 text-xs text-nord-blue-light hover:bg-white/5"
                >
                  <Plus size={12} className="inline mr-1 -mt-0.5" /> Adicionar “{query.trim()}” como outro item (embalagem, limpeza…)
                </button>
              </li>
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => add(newOtherItem())} className="btn-outline !py-1.5 !px-2.5 !text-xs">
            <Plus size={13} /> Outro item
          </button>
          <button type="button" onClick={() => add(newAdjustment("Frete"))} className="btn-outline !py-1.5 !px-2.5 !text-xs">
            <Plus size={13} /> Frete
          </button>
          <button type="button" onClick={() => add(newAdjustment("Desconto"))} className="btn-outline !py-1.5 !px-2.5 !text-xs">
            <Plus size={13} /> Desconto
          </button>
        </div>
      </div>

      <datalist id="compra-unidades">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <datalist id="compra-ajustes">
        {AJUSTE_NAMES.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      {items.length > 0 && (
        <>
          {/* Diferença contra o combinado */}
          {above && (
            <div className="rounded-lg border border-nord-danger/40 bg-nord-danger/10 p-3 space-y-3" role="alert">
              <p className="text-sm text-white flex items-center gap-2">
                <TriangleAlert size={15} className="text-nord-danger shrink-0" />
                Esta compra veio <strong>{formatCurrency(totals.diferenca)}</strong> acima do combinado
                {totals.diferencaPct !== null && <> (+{totals.diferencaPct.toFixed(1).replace(".", ",")}%)</>}.
              </p>
              <p className="text-xs text-nord-gray">
                {[
                  breakdown.precoAcima > 0 ? `Preço acima do combinado: ${formatCurrency(breakdown.precoAcima)}` : null,
                  breakdown.ajustes > 0 ? `Frete/ajustes não combinados: ${formatCurrency(breakdown.ajustes)}` : null,
                  breakdown.precoAbaixo > 0 ? `Economia em outros itens: ${formatCurrency(breakdown.precoAbaixo)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="O que fazer com a diferença">
                <button
                  type="button"
                  role="radio"
                  aria-checked={decision.acao === "CONTESTAR"}
                  onClick={() => onDecisionChange({ ...decision, acao: "CONTESTAR" })}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    decision.acao === "CONTESTAR" ? "border-nord-danger bg-nord-danger/20 text-white" : "border-nord-danger/50 text-nord-danger hover:bg-nord-danger/10"
                  }`}
                >
                  <MessageSquare size={13} /> Contestar com o fornecedor
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={decision.acao === "ACEITAR"}
                  onClick={() => onDecisionChange({ ...decision, acao: "ACEITAR" })}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    decision.acao === "ACEITAR" ? "border-nord-blue bg-nord-blue/25 text-white" : "border-nord-border text-nord-gray hover:text-white"
                  }`}
                >
                  <Check size={13} /> Aceitar e registrar o motivo
                </button>
              </div>
              {decision.acao === "ACEITAR" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-xs text-nord-gray mb-1">Motivo</span>
                    <select value={decision.motivo} onChange={(e) => onDecisionChange({ ...decision, motivo: e.target.value })} className="input">
                      <option value="">Escolha o motivo…</option>
                      {DIVERGENCE_REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs text-nord-gray mb-1">Observação{decision.motivo === "Outro" ? " (obrigatória)" : " (opcional)"}</span>
                    <input value={decision.observacao} onChange={(e) => onDecisionChange({ ...decision, observacao: e.target.value })} maxLength={500} className="input" />
                  </label>
                </div>
              )}
              {decision.acao === "CONTESTAR" && (
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">O que será cobrado do fornecedor (opcional)</span>
                  <input value={decision.observacao} onChange={(e) => onDecisionChange({ ...decision, observacao: e.target.value })} maxLength={500} className="input" placeholder="Ex.: mussarela cobrada a R$ 41,50; combinado R$ 38,00" />
                </label>
              )}
              {decision.acao === "" && <p className="text-xs text-nord-warning">Escolha uma das opções para poder salvar.</p>}
            </div>
          )}

          {/* Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <dl className="space-y-1">
              <div className="flex justify-between gap-3"><dt className="text-nord-gray">Itens e ajustes</dt><dd className="text-white">{formatCurrency(totals.totalCobrado)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-nord-gray">Valor da conta</dt><dd className="text-white">{valorBoleto > 0 ? formatCurrency(valorBoleto) : "—"}</dd></div>
              <div className="pt-1">
                {valorBoleto <= 0 ? (
                  totals.totalCobrado > 0 ? (
                    <button type="button" onClick={() => onUseTotal(totals.totalCobrado)} className="text-nord-blue-light hover:underline">
                      Usar {formatCurrency(totals.totalCobrado)} como valor da conta
                    </button>
                  ) : null
                ) : closes ? (
                  <span className="inline-flex items-center gap-1 text-nord-success"><Check size={13} /> Fecha com o valor da conta</span>
                ) : gap > 0 ? (
                  <span className="inline-flex flex-wrap items-center gap-1 text-nord-warning">
                    <TriangleAlert size={13} /> Faltam {formatCurrency(gap)} para fechar com a conta.
                    <button type="button" onClick={() => onUseTotal(totals.totalCobrado)} className="text-nord-blue-light hover:underline">Usar {formatCurrency(totals.totalCobrado)} como valor</button>
                  </span>
                ) : (
                  <span className="inline-flex flex-wrap items-center gap-1 text-nord-danger">
                    <TriangleAlert size={13} /> Os itens passam {formatCurrency(-gap)} do valor da conta.
                    <button type="button" onClick={() => onUseTotal(totals.totalCobrado)} className="text-nord-blue-light hover:underline">Usar {formatCurrency(totals.totalCobrado)} como valor</button>
                  </span>
                )}
              </div>
            </dl>
            <dl className="space-y-1">
              <div className="flex justify-between gap-3"><dt className="text-nord-gray">Total combinado</dt><dd className="text-white">{totals.totalCombinado > 0 || totals.totalComparado > 0 ? formatCurrency(totals.totalCombinado) : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-nord-gray">Total cobrado (dos itens combinados)</dt><dd className="text-white">{totals.totalCombinado > 0 || totals.totalComparado > 0 ? formatCurrency(totals.totalComparado) : "—"}</dd></div>
              <div className="flex justify-between gap-3">
                <dt className="text-nord-gray">Diferença</dt>
                <dd className={totals.diferenca > 0.05 ? "text-nord-danger font-medium" : totals.diferenca < -0.05 ? "text-nord-success font-medium" : "text-white"}>
                  {totals.totalCombinado > 0 || totals.totalComparado > 0
                    ? `${signed(totals.diferenca)}${totals.diferencaPct !== null && Math.abs(totals.diferenca) > 0.05 ? ` (${totals.diferenca > 0 ? "+" : ""}${totals.diferencaPct.toFixed(1).replace(".", ",")}%)` : ""}`
                    : "—"}
                </dd>
              </div>
              {items.some((d) => d.kind !== "AJUSTE" && d.precoCombinado.trim() === "") && (
                <p className="text-nord-gray pt-1">Itens sem preço combinado não entram na comparação.</p>
              )}
            </dl>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-nord-gray mb-1">
              <span>Detalhado: <strong className="text-white">{pct}%</strong> do valor da conta</span>
            </div>
            <div className="h-2 rounded-full bg-nord-border overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Quanto do valor da conta está detalhado em itens">
              <div className={`h-full rounded-full ${pct >= 100 ? "bg-nord-blue" : "bg-nord-warning"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </>
      )}

      <p className="text-[11px] text-nord-gray flex items-start gap-1.5">
        <Info size={12} className="shrink-0 mt-0.5" />
        O valor combinado vem do último preço pago a este fornecedor (sugerido sozinho) ou do que você digitar. Em breve: pedido do Estoque e tabela de preços do fornecedor.
      </p>
    </section>
  );
}
