"use client";

import { useMemo, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
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
  /** Valor digitado, sempre positivo nos descontos (o sinal vem de `desconto`). */
  precoCobrado: string;
  /** Só em ajustes: o valor é um desconto (entra com sinal negativo). */
  desconto: boolean;
  /** Categoria financeira (DRE) deste item — null = "mesma do boleto" (ver `splitPayableByCategory`
   *  em `@/lib/compra-itens`). Item novo já nasce com a categoria do boleto pré-selecionada. */
  categoriaId: string | null;
};

export type IngredientOption = { id: string; name: string; unidade: string; unidadeCompra: string | null };
export type FinancialCategoryOption = { id: string; name: string };

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
  categoriaId: string | null;
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
  // Insumo que saiu do cadastro do Estoque (ficou só o nome): vira "Outro item" para a conta poder ser salva.
  const kind: ItemKind = it.kind === "INSUMO" && !it.ingredientId ? "OUTRO" : it.kind;
  const desconto = kind === "AJUSTE" && it.precoCobrado < 0;
  return {
    key: newKey(),
    kind,
    ingredientId: kind === "INSUMO" ? it.ingredientId : null,
    nome: it.nome,
    grupo: kind === "OUTRO" ? (it.kind === "INSUMO" ? "Outros" : it.grupo ?? "Outros") : "",
    quantidade: kind === "AJUSTE" ? "1" : textOf(it.quantidade),
    unidade: kind === "AJUSTE" ? "" : it.unidade,
    precoCombinado: textOf(desconto && it.precoCombinado !== null ? Math.abs(it.precoCombinado) : it.precoCombinado),
    origemCombinado: it.origemCombinado,
    precoCobrado: textOf(desconto ? Math.abs(it.precoCobrado) : it.precoCobrado),
    desconto,
    categoriaId: it.categoriaId,
  };
}

function num(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Valor com o sinal certo: desconto sempre negativo; nos outros, como foi digitado. */
function withSign(text: string, desconto: boolean): string {
  const n = num(text);
  if (n === null) return text.trim() === "" ? "" : text;
  return String(desconto ? -Math.abs(n) : n);
}

export function draftsToPayload(items: DraftItem[]) {
  return items.map((d) => ({
    kind: d.kind,
    ingredientId: d.kind === "INSUMO" ? d.ingredientId : null,
    nome: d.nome,
    grupo: d.kind === "OUTRO" ? d.grupo : null,
    quantidade: d.kind === "AJUSTE" ? 1 : d.quantidade,
    unidade: d.kind === "AJUSTE" ? "-" : d.unidade,
    precoCombinado: d.precoCombinado.trim() === "" ? null : d.kind === "AJUSTE" ? withSign(d.precoCombinado, d.desconto) : d.precoCombinado,
    origemCombinado: d.precoCombinado.trim() === "" ? null : d.origemCombinado ?? "MANUAL",
    precoCobrado: d.kind === "AJUSTE" ? withSign(d.precoCobrado, d.desconto) : d.precoCobrado,
    categoriaId: d.categoriaId,
  }));
}

/** Números de uma linha para os cálculos da tela (campo vazio ou inválido conta como 0 / sem combinado). */
function numeric(d: DraftItem) {
  const quantidade = d.kind === "AJUSTE" ? 1 : num(d.quantidade) ?? 0;
  const sign = d.kind === "AJUSTE" && d.desconto ? -1 : 1;
  const rawCobrado = num(d.precoCobrado) ?? 0;
  const cobrado = d.kind === "AJUSTE" && d.desconto ? -Math.abs(rawCobrado) : rawCobrado;
  const rawCombinado = num(d.precoCombinado);
  // Frete/desconto sem combinado contam como R$ 0,00 combinado (igual ao servidor).
  const combinado = rawCombinado === null ? (d.kind === "AJUSTE" ? 0 : null) : d.kind === "AJUSTE" && d.desconto ? sign * Math.abs(rawCombinado) : rawCombinado;
  return { kind: d.kind, quantidade, precoCombinado: combinado, precoCobrado: cobrado, total: round2(quantidade * cobrado) };
}

export function summarize(items: DraftItem[]) {
  const rows = items.map(numeric);
  return { rows, totals: computeTotals(rows), breakdown: diffBreakdown(rows) };
}

/** Itens novos já com o “combinado” sugerido pelo último preço pago a este fornecedor, e a
 *  categoria financeira pré-selecionada igual à do boleto (quem lança só troca o que for diferente). */
export function newItemFromIngredient(ing: IngredientOption, hints: Record<string, PriceHint>, categoriaIdBoleto: string): DraftItem {
  const unidade = ing.unidadeCompra || ing.unidade;
  const hint = hints[itemKey({ kind: "INSUMO", ingredientId: ing.id, nome: ing.name, unidade })];
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
    desconto: false,
    categoriaId: categoriaIdBoleto || null,
  };
}

export function newOtherItem(nome = "", categoriaIdBoleto = ""): DraftItem {
  return {
    key: newKey(),
    kind: "OUTRO",
    ingredientId: null,
    nome,
    grupo: "Outros",
    quantidade: "",
    unidade: "un",
    precoCombinado: "",
    origemCombinado: null,
    precoCobrado: "",
    desconto: false,
    categoriaId: categoriaIdBoleto || null,
  };
}

export function newAdjustment(nome: string, desconto = false, categoriaIdBoleto = ""): DraftItem {
  return {
    key: newKey(),
    kind: "AJUSTE",
    ingredientId: null,
    nome,
    grupo: "",
    quantidade: "1",
    unidade: "",
    precoCombinado: "",
    origemCombinado: null,
    precoCobrado: "",
    desconto,
    categoriaId: categoriaIdBoleto || null,
  };
}

function normalizeSearch(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function signedMoney(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatCurrency(Math.abs(value))}`;
}

/** Preço unitário com até 4 casas (preços de nota fiscal costumam ter 3 ou 4). */
function unitMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

function percent(value: number) {
  return value.toFixed(1).replace(".", ",");
}

function useIsDesktop() {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia("(min-width: 640px)");
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () => window.matchMedia("(min-width: 640px)").matches,
    () => true
  );
}

const SEARCH_LIMIT = 8;

// ------------------------------------------------------------------------------------------------
// Componente
// ------------------------------------------------------------------------------------------------

export function CompraItensEditor({
  items,
  onItemsChange,
  ingredients,
  categorias,
  categoriaIdBoleto,
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
  loadingItems,
  loadFailed,
  onRetryLoad,
}: {
  items: DraftItem[];
  onItemsChange: (items: DraftItem[]) => void;
  ingredients: IngredientOption[];
  /** Categorias financeiras (DRE) para o seletor por item — mesma lista do campo "Categoria
   *  Financeira" do boleto. */
  categorias: FinancialCategoryOption[];
  /** Categoria financeira escolhida no boleto agora (campo "Categoria Financeira" do formulário):
   *  todo item novo já nasce com ela selecionada. */
  categoriaIdBoleto: string;
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
  /** Os itens gravados ainda estão sendo buscados / a busca falhou. */
  loadingItems: boolean;
  loadFailed: boolean;
  onRetryLoad: () => void;
}) {
  const desktop = useIsDesktop();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [confirmRepeat, setConfirmRepeat] = useState(false);

  const { rows, totals, breakdown } = useMemo(() => summarize(items), [items]);
  const above = isAboveAgreed(totals);
  const pct = detailPercent(totals.totalCobrado, valorBoleto);
  const closes = valorBoleto > 0 && closesWithBoleto(totals.totalCobrado, valorBoleto);
  const gap = round2(valorBoleto - totals.totalCobrado);
  const hasComparison = totals.totalCombinado > 0 || totals.totalComparado > 0;
  const locked = loadingItems || loadFailed;

  const allMatches = useMemo(() => {
    const q = normalizeSearch(query.trim());
    if (!q) return [];
    const words = q.split(/\s+/).filter(Boolean);
    return ingredients.filter((i) => {
      const name = normalizeSearch(i.name);
      return words.every((w) => name.includes(w));
    });
  }, [ingredients, query]);
  const matches = allMatches.slice(0, SEARCH_LIMIT);
  // opções navegáveis: os insumos + “adicionar como outro item”
  const optionCount = matches.length + 1;
  const activeOption = Math.min(activeIndex, optionCount - 1);
  const listOpen = searchFocused && query.trim() !== "";

  function update(key: string, patch: Partial<DraftItem>) {
    onItemsChange(items.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }
  function remove(key: string) {
    onItemsChange(items.filter((d) => d.key !== key));
  }
  function add(item: DraftItem) {
    onItemsChange([...items, item]);
    setQuery("");
    setActiveIndex(0);
    setFocusKey(item.key);
  }
  function pickOption(index: number) {
    if (index < matches.length) add(newItemFromIngredient(matches[index], hints, categoriaIdBoleto));
    else add(newOtherItem(query.trim(), categoriaIdBoleto));
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (query) {
        // Esc na busca limpa a busca; não fecha o formulário.
        e.preventDefault();
        e.stopPropagation();
        setQuery("");
      }
      return;
    }
    if (!listOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((activeOption + 1) % optionCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((activeOption - 1 + optionCount) % optionCount);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickOption(activeOption);
    }
  }

  function repeatLast() {
    if (!lastPurchase) return;
    const copied = lastPurchase.itens.map((it) => {
      const draft = draftFromSaved(it);
      if (draft.kind === "AJUSTE") return draft;
      const hint = hints[itemKey({ kind: draft.kind, ingredientId: draft.ingredientId, nome: draft.nome, unidade: draft.unidade })];
      const preco = hint ? hint.preco : it.precoCombinado ?? it.precoCobrado;
      // O preço de referência vira o combinado E o ponto de partida do cobrado: quem registra só corrige o que mudou.
      return { ...draft, precoCombinado: textOf(preco), origemCombinado: "ULTIMO_PRECO" as PriceSource, precoCobrado: textOf(preco) };
    });
    onItemsChange(copied);
    setConfirmRepeat(false);
  }

  function chooseAction(acao: "ACEITAR" | "CONTESTAR") {
    // O texto digitado para uma opção não vira o da outra.
    if (decision.acao === acao) return;
    onDecisionChange({ acao, motivo: "", observacao: "" });
  }

  /** Pedaços de uma linha de item, usados tanto na tabela (tela larga) quanto no cartão (celular). */
  function parts(d: DraftItem, i: number) {
    const r = rows[i];
    const comb = r.precoCombinado;
    const cob = num(d.precoCobrado);
    const diff = comb !== null && cob !== null ? round2((d.kind === "AJUSTE" && d.desconto ? -Math.abs(cob) : cob) - comb) : null;
    const label = d.nome || "item";
    const exactDiff =
      comb !== null && cob !== null ? (d.kind === "AJUSTE" && d.desconto ? -Math.abs(cob) : cob) - comb : null;

    const name: ReactNode =
      d.kind === "INSUMO" ? (
        <div className="text-white text-sm leading-5">
          <span className="text-nord-gray mr-1.5">{i + 1}.</span>
          {d.nome}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-nord-gray text-sm">{i + 1}.</span>
          <input
            value={d.nome}
            list={d.kind === "AJUSTE" ? "compra-ajustes" : undefined}
            onChange={(e) => update(d.key, { nome: e.target.value })}
            placeholder={d.kind === "AJUSTE" ? "Tipo de ajuste" : "Nome do item"}
            aria-label={d.kind === "AJUSTE" ? `Tipo de ajuste do item ${i + 1}` : `Nome do item ${i + 1}`}
            className="input-sm w-full"
            maxLength={120}
          />
        </div>
      );

    const badges: ReactNode = (
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {d.kind === "INSUMO" && <span className="rounded px-1.5 py-px text-[11px] bg-nord-blue/25 text-white">Insumo</span>}
        {d.kind === "AJUSTE" && (
          <>
            <span className="rounded px-1.5 py-px text-[11px] bg-white/10 text-nord-gray">Ajuste</span>
            <select
              value={d.desconto ? "-" : "+"}
              onChange={(e) => update(d.key, { desconto: e.target.value === "-" })}
              aria-label={`O ajuste do item ${i + 1} soma ou desconta`}
              className="input-sm !py-0.5"
            >
              <option value="+">Soma (frete, juros…)</option>
              <option value="-">Desconta (desconto)</option>
            </select>
          </>
        )}
        {d.kind === "OUTRO" && (
          <>
            <span className="rounded px-1.5 py-px text-[11px] bg-white/10 text-nord-gray">Outro item</span>
            <select
              value={d.grupo}
              onChange={(e) => update(d.key, { grupo: e.target.value })}
              aria-label={`Grupo do item ${i + 1}`}
              className="input-sm !py-0.5"
            >
              {!ITEM_GROUPS.includes(d.grupo as (typeof ITEM_GROUPS)[number]) && d.grupo && <option value={d.grupo}>{d.grupo}</option>}
              {ITEM_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </>
        )}
        {/* Categoria financeira (DRE) deste item — mesmo seletor pra Insumo, Outro item e Ajuste
            (frete/desconto): sem caso especial, como decidido. Vazio = "mesma do boleto". */}
        <select
          value={d.categoriaId ?? ""}
          onChange={(e) => update(d.key, { categoriaId: e.target.value || null })}
          aria-label={`Categoria financeira de ${label}`}
          title="Categoria financeira (DRE) deste item — padrão: mesma do boleto"
          className="input-sm !py-0.5 max-w-[11rem]"
        >
          <option value="">Mesma do boleto</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    );

    const qty: ReactNode =
      d.kind === "AJUSTE" ? (
        <span className="text-nord-gray">—</span>
      ) : (
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={d.quantidade}
          autoFocus={d.key === focusKey}
          onChange={(e) => update(d.key, { quantidade: e.target.value })}
          aria-label={`Quantidade de ${label}`}
          className="input-sm w-full"
        />
      );
    const unit: ReactNode =
      d.kind === "AJUSTE" ? (
        <span className="text-nord-gray">—</span>
      ) : (
        <input
          value={d.unidade}
          list="compra-unidades"
          onChange={(e) => update(d.key, { unidade: e.target.value })}
          aria-label={`Unidade de ${label}`}
          className="input-sm w-full"
          maxLength={12}
        />
      );
    const combInput: ReactNode = (
      <>
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
          aria-label={`Preço combinado de ${label}`}
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
          {d.kind !== "AJUSTE" && num(d.precoCombinado) === 0 && <span className="block text-nord-warning">Combinado R$ 0,00: confira.</span>}
        </div>
      </>
    );
    const cobInput: ReactNode = (
      <input
        type="number"
        step="any"
        inputMode="decimal"
        min={d.kind === "AJUSTE" && d.desconto ? "0" : undefined}
        value={d.precoCobrado}
        placeholder={d.kind === "AJUSTE" && d.desconto ? "valor do desconto" : undefined}
        onChange={(e) => update(d.key, { precoCobrado: e.target.value })}
        aria-label={`Valor cobrado de ${label}`}
        className="input-sm w-full"
      />
    );
    const diffNode: ReactNode =
      diff === null || exactDiff === null ? (
        <span className="text-nord-gray">—</span>
      ) : Math.abs(exactDiff) < 1e-9 ? (
        <span className="inline-flex items-center gap-1 text-nord-success">
          <Check size={12} /> igual
        </span>
      ) : (
        <span className={exactDiff > 0 ? "text-nord-danger" : "text-nord-success"}>
          {exactDiff > 0 ? "+" : "-"}
          {unitMoney(Math.abs(exactDiff))}
          {comb !== null && comb > 0 && ` (${exactDiff > 0 ? "+" : ""}${percent((exactDiff / comb) * 100)}%)`}
        </span>
      );
    const removeBtn: ReactNode = (
      <button type="button" onClick={() => remove(d.key)} aria-label={`Remover ${label}`} className="text-nord-gray hover:text-nord-danger p-2 -m-1">
        <Trash2 size={15} />
      </button>
    );
    return { name, badges, qty, unit, combInput, cobInput, diffNode, removeBtn, total: formatCurrency(r.total) };
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
            Não mexe no estoque. Boleto com produtos de categorias diferentes (ex.: descartáveis + material de
            limpeza)? Troque a categoria de cada item — só muda quem veio diferente da categoria do boleto.
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1">
          <button
            type="button"
            disabled={!lastPurchase || loadingHistory || locked}
            onClick={() => (items.length > 0 ? setConfirmRepeat(true) : repeatLast())}
            className="btn-outline !py-1.5 !px-2.5 !text-xs disabled:opacity-50"
          >
            <Repeat size={13} /> Repetir última compra deste fornecedor
          </button>
          {!lastPurchase && !loadingHistory && (
            <span className="text-[11px] text-nord-gray">Disponível quando o fornecedor já tem uma compra com itens registrada.</span>
          )}
        </div>
      </div>

      <label className="block max-w-xs">
        <span className="block text-xs text-nord-gray mb-1">Nº da nota ou do boleto do fornecedor (opcional)</span>
        <input value={numeroNota} onChange={(e) => onNumeroNotaChange(e.target.value)} maxLength={60} placeholder="Ex.: NF 48213" className="input" />
        {numeroNota.trim() !== "" && items.length === 0 && (
          <span className="block text-[11px] text-nord-warning mt-1">O número só é gravado junto com os itens.</span>
        )}
      </label>

      {confirmRepeat && lastPurchase && (
        <div className="rounded-lg border border-nord-warning/30 bg-nord-warning/10 px-3 py-2 text-xs text-nord-warning flex flex-wrap items-center gap-2">
          <span>Isto troca os itens digitados pelos da última compra deste fornecedor. Continuar?</span>
          <button type="button" onClick={repeatLast} className="btn-outline !py-1 !px-2 !text-xs">
            Trocar itens
          </button>
          <button type="button" onClick={() => setConfirmRepeat(false)} className="text-nord-gray hover:text-white underline">
            Cancelar
          </button>
        </div>
      )}

      {loadingItems ? (
        <p className="text-xs text-nord-gray rounded-lg border border-dashed border-nord-border px-3 py-3">Carregando os itens desta conta…</p>
      ) : loadFailed ? (
        <div className="text-xs rounded-lg border border-nord-danger/40 bg-nord-danger/10 px-3 py-3 text-red-300 flex flex-wrap items-center gap-2">
          <span>Não foi possível carregar os itens desta conta. Para nenhum item se perder, só dá para salvar depois de carregar.</span>
          <button type="button" onClick={onRetryLoad} className="btn-outline !py-1 !px-2 !text-xs">
            Tentar de novo
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-nord-gray rounded-lg border border-dashed border-nord-border px-3 py-3">
          {hadCompra
            ? "Sem itens: ao salvar, os itens que estavam gravados nesta conta serão removidos."
            : "Sem itens: esta conta não entra nos relatórios de gasto por produto. Você pode salvar assim e detalhar depois."}
        </p>
      ) : desktop ? (
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-xs min-w-[820px]">
            <thead>
              <tr className="text-left text-nord-gray border-b border-nord-border">
                <th scope="col" className="py-1.5 pr-2 font-medium">Produto</th>
                <th scope="col" className="py-1.5 pr-2 font-medium w-20">Qtd</th>
                <th scope="col" className="py-1.5 pr-2 font-medium w-20">Un.</th>
                <th scope="col" className="py-1.5 pr-2 font-medium w-28">Combinado (R$/un.)</th>
                <th scope="col" className="py-1.5 pr-2 font-medium w-28">Cobrado (R$/un.)</th>
                <th scope="col" className="py-1.5 pr-2 font-medium text-right w-36">Diferença por un.</th>
                <th scope="col" className="py-1.5 pr-2 font-medium text-right w-24">Total</th>
                <th scope="col" className="py-1.5 w-8">
                  <span className="sr-only">Remover</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((d, i) => {
                const p = parts(d, i);
                return (
                  <tr key={d.key} className="border-b border-nord-border/50 align-top">
                    <td className="py-1.5 pr-2">
                      {p.name}
                      {p.badges}
                    </td>
                    <td className="py-1.5 pr-2">{p.qty}</td>
                    <td className="py-1.5 pr-2">{p.unit}</td>
                    <td className="py-1.5 pr-2">{p.combInput}</td>
                    <td className="py-1.5 pr-2">{p.cobInput}</td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">{p.diffNode}</td>
                    <td className="py-1.5 pr-2 text-right text-white whitespace-nowrap">{p.total}</td>
                    <td className="py-1.5 text-right">{p.removeBtn}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((d, i) => {
            const p = parts(d, i);
            return (
              <li key={d.key} className="rounded-lg border border-nord-border bg-nord-card/60 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {p.name}
                    {p.badges}
                  </div>
                  {p.removeBtn}
                </div>
                {d.kind !== "AJUSTE" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[11px] text-nord-gray mb-0.5">Quantidade</span>
                      {p.qty}
                    </label>
                    <label className="block">
                      <span className="block text-[11px] text-nord-gray mb-0.5">Unidade</span>
                      {p.unit}
                    </label>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[11px] text-nord-gray mb-0.5">Combinado (R$/un.)</span>
                    {p.combInput}
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-nord-gray mb-0.5">Cobrado (R$/un.)</span>
                    {p.cobInput}
                  </label>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-nord-border/50">
                  <span className="text-nord-gray">
                    Diferença: <span className="ml-1">{p.diffNode}</span>
                  </span>
                  <span className="text-white font-medium">{p.total}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Adicionar */}
      <div className="space-y-2">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={onSearchKeyDown}
            disabled={locked}
            placeholder="Digite para buscar um produto do estoque…"
            aria-label="Buscar produto para adicionar"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls="compra-busca-lista"
            aria-activedescendant={listOpen ? `compra-busca-${activeOption}` : undefined}
            className="input w-full disabled:opacity-50"
            autoComplete="off"
          />
          {listOpen && (
            <ul
              id="compra-busca-lista"
              role="listbox"
              aria-label="Produtos encontrados"
              onMouseDown={(e) => e.preventDefault()}
              className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-nord-border bg-nord-card shadow-2xl max-h-56 overflow-y-auto nord-scrollbar"
            >
              {matches.map((m, idx) => (
                <li key={m.id} id={`compra-busca-${idx}`} role="option" aria-selected={idx === activeOption}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => pickOption(idx)}
                    className={`w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 flex items-center justify-between gap-3 ${idx === activeOption ? "bg-white/10" : ""}`}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="text-[11px] text-nord-gray shrink-0">{m.unidadeCompra || m.unidade}</span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && <li className="px-3 py-2 text-xs text-nord-gray">Nenhum insumo encontrado com esse nome.</li>}
              {allMatches.length > SEARCH_LIMIT && (
                <li className="px-3 py-1.5 text-[11px] text-nord-gray">
                  Mostrando {SEARCH_LIMIT} de {allMatches.length}. Digite mais letras para refinar.
                </li>
              )}
              <li id={`compra-busca-${matches.length}`} role="option" aria-selected={activeOption === matches.length} className="border-t border-nord-border">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => pickOption(matches.length)}
                  className={`w-full text-left px-3 py-2 text-xs text-nord-blue-light hover:bg-white/5 ${activeOption === matches.length ? "bg-white/10" : ""}`}
                >
                  <Plus size={12} className="inline mr-1 -mt-0.5" /> Adicionar “{query.trim()}” como outro item (embalagem, limpeza…)
                </button>
              </li>
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={locked} onClick={() => add(newOtherItem("", categoriaIdBoleto))} className="btn-outline !py-1.5 !px-2.5 !text-xs disabled:opacity-50">
            <Plus size={13} /> Outro item
          </button>
          <button type="button" disabled={locked} onClick={() => add(newAdjustment("Frete", false, categoriaIdBoleto))} className="btn-outline !py-1.5 !px-2.5 !text-xs disabled:opacity-50">
            <Plus size={13} /> Frete
          </button>
          <button type="button" disabled={locked} onClick={() => add(newAdjustment("Desconto", true, categoriaIdBoleto))} className="btn-outline !py-1.5 !px-2.5 !text-xs disabled:opacity-50">
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

      {items.length > 0 && !locked && (
        <>
          {/* Diferença contra o combinado */}
          {above && (
            <div className="rounded-lg border border-nord-danger/40 bg-nord-danger/10 p-3 space-y-3">
              <p className="text-sm text-white flex items-center gap-2">
                <TriangleAlert size={15} className="text-nord-danger shrink-0" />
                <span>
                  Esta compra veio <strong>{formatCurrency(totals.diferenca)}</strong> acima do combinado
                  {totals.diferencaPct !== null && <> (+{percent(totals.diferencaPct)}%)</>}.
                </span>
              </p>
              <p className="text-xs text-nord-gray">
                {[
                  breakdown.precoAcima > 0 ? `Preço acima do combinado: ${formatCurrency(breakdown.precoAcima)}` : null,
                  breakdown.ajustes > 0 ? `Frete/ajustes acima do combinado: ${formatCurrency(breakdown.ajustes)}` : null,
                  breakdown.ajustes < 0 ? `Descontos/ajustes abaixo do combinado: -${formatCurrency(-breakdown.ajustes)}` : null,
                  breakdown.precoAbaixo > 0 ? `Economia em outros itens: ${formatCurrency(breakdown.precoAbaixo)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="O que fazer com a diferença">
                <button
                  type="button"
                  aria-pressed={decision.acao === "CONTESTAR"}
                  onClick={() => chooseAction("CONTESTAR")}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    decision.acao === "CONTESTAR" ? "border-nord-danger bg-nord-danger/20 text-white" : "border-nord-danger/50 text-red-300 hover:bg-nord-danger/10"
                  }`}
                >
                  <MessageSquare size={13} /> Contestar com o fornecedor
                </button>
                <button
                  type="button"
                  aria-pressed={decision.acao === "ACEITAR"}
                  onClick={() => chooseAction("ACEITAR")}
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
                        <option key={r} value={r}>
                          {r}
                        </option>
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
                  <input
                    value={decision.observacao}
                    onChange={(e) => onDecisionChange({ ...decision, observacao: e.target.value })}
                    maxLength={500}
                    className="input"
                    placeholder="Ex.: mussarela cobrada a R$ 41,50; combinado R$ 38,00"
                  />
                </label>
              )}
              {decision.acao === "" && <p className="text-xs text-nord-warning">Escolha uma das opções para poder salvar.</p>}
            </div>
          )}

          {/* Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <dl className="space-y-1">
              <div className="flex justify-between gap-3">
                <dt className="text-nord-gray">Itens e ajustes</dt>
                <dd className="text-white">{formatCurrency(totals.totalCobrado)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-nord-gray">Valor do boleto</dt>
                <dd className="text-white">{valorBoleto > 0 ? formatCurrency(valorBoleto) : "—"}</dd>
              </div>
              <div className="pt-1">
                {valorBoleto <= 0 ? (
                  totals.totalCobrado > 0 ? (
                    <button type="button" onClick={() => onUseTotal(totals.totalCobrado)} className="text-nord-blue-light hover:underline">
                      Usar {formatCurrency(totals.totalCobrado)} como valor do boleto
                    </button>
                  ) : null
                ) : closes ? (
                  <span className="inline-flex items-center gap-1 text-nord-success">
                    <Check size={13} /> Fecha com o valor do boleto
                  </span>
                ) : gap > 0 ? (
                  <span className="inline-flex flex-wrap items-center gap-1 text-nord-warning">
                    <TriangleAlert size={13} /> Faltam {formatCurrency(gap)} para fechar com o boleto.
                    {totals.totalCobrado > 0 && (
                      <button type="button" onClick={() => onUseTotal(totals.totalCobrado)} className="text-nord-blue-light hover:underline">
                        Usar {formatCurrency(totals.totalCobrado)} como valor
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="inline-flex flex-wrap items-center gap-1 text-nord-danger">
                    <TriangleAlert size={13} /> Os itens passam {formatCurrency(-gap)} do valor do boleto.
                    {totals.totalCobrado > 0 && (
                      <button type="button" onClick={() => onUseTotal(totals.totalCobrado)} className="text-nord-blue-light hover:underline">
                        Usar {formatCurrency(totals.totalCobrado)} como valor
                      </button>
                    )}
                  </span>
                )}
              </div>
            </dl>
            <dl className="space-y-1">
              <div className="flex justify-between gap-3">
                <dt className="text-nord-gray">Total combinado</dt>
                <dd className="text-white">{hasComparison ? formatCurrency(totals.totalCombinado) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-nord-gray">Cobrado nos itens com combinado</dt>
                <dd className="text-white">{hasComparison ? formatCurrency(totals.totalComparado) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-nord-gray">Diferença</dt>
                <dd className={totals.diferenca > 0.05 ? "text-nord-danger font-medium" : totals.diferenca < -0.05 ? "text-nord-success font-medium" : "text-white"}>
                  {hasComparison
                    ? `${signedMoney(totals.diferenca)}${totals.diferencaPct !== null && Math.abs(totals.diferenca) > 0.05 ? ` (${totals.diferenca > 0 ? "+" : ""}${percent(totals.diferencaPct)}%)` : ""}`
                    : "—"}
                </dd>
              </div>
              {!hasComparison && <p className="text-nord-gray pt-1">Nenhum produto tem preço combinado: não há o que comparar.</p>}
              {hasComparison && items.some((d) => d.kind !== "AJUSTE" && d.precoCombinado.trim() === "") && (
                <p className="text-nord-gray pt-1">Itens sem preço combinado não entram na comparação.</p>
              )}
            </dl>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-nord-gray mb-1">
              <span>
                Detalhado: <strong className="text-white">{pct}%</strong> do valor do boleto
              </span>
            </div>
            <div
              className="h-2 rounded-full bg-nord-border overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Quanto do valor do boleto está detalhado em itens"
            >
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
