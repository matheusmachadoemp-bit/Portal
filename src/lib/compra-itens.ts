/**
 * Regras PURAS (sem banco) de "o que foi comprado" no Contas a Pagar: validar/normalizar os itens da
 * nota, calcular totais e a diferença entre o preço COMBINADO e o COBRADO, e escolher o que sugerir
 * como "combinado" a partir do histórico de compras do fornecedor. A gravação fica em
 * `compra-itens-server.ts`; a tela em `contas-a-pagar/compra-itens-editor.tsx`.
 */

export const ITEM_KINDS = ["INSUMO", "OUTRO", "AJUSTE"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const PRICE_SOURCES = ["PEDIDO_ESTOQUE", "TABELA_FORNECEDOR", "ULTIMO_PRECO", "MANUAL", "NAO_COMBINADO"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  PEDIDO_ESTOQUE: "Pedido do Estoque",
  TABELA_FORNECEDOR: "Tabela do fornecedor",
  ULTIMO_PRECO: "Último preço pago",
  MANUAL: "Digitado",
  NAO_COMBINADO: "Não combinado",
};

export type DivergenceStatus = "SEM_DIVERGENCIA" | "EM_CONTESTACAO" | "ACEITA";

export const DIVERGENCE_REASONS = ["Reajuste do fornecedor", "Frete não combinado", "Quantidade diferente", "Outro"] as const;

/** Diferença total (R$) até a qual a nota é tratada como "dentro do combinado" (arredondamentos de centavos). */
export const DIVERGENCE_TOLERANCE = 0.05;

export const MAX_ITEMS = 200;
export const MAX_NAME = 120;
export const MAX_GROUP = 40;
export const MAX_UNIT = 12;
export const MAX_NOTE = 500;
const MAX_VALUE = 10_000_000;

export const ITEM_GROUPS = ["Embalagem", "Descartáveis", "Limpeza", "Gás", "Bebidas", "Manutenção", "Utensílios", "Outros"] as const;
export const UNIT_SUGGESTIONS = ["kg", "g", "l", "ml", "un", "cx", "pct", "saco", "fardo", "dz", "pç"] as const;
export const AJUSTE_NAMES = ["Frete", "Desconto", "Juros / multa", "Outro ajuste"] as const;

/** Arredonda em centavos sem o ruído do ponto flutuante (1.005 → 1.01). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Entrada de um item como a tela envia. */
export type ItemInput = {
  kind?: unknown;
  ingredientId?: unknown;
  nome?: unknown;
  grupo?: unknown;
  quantidade?: unknown;
  unidade?: unknown;
  precoCombinado?: unknown;
  origemCombinado?: unknown;
  precoCobrado?: unknown;
};

export type NormalizedItem = {
  ordem: number;
  kind: ItemKind;
  ingredientId: string | null;
  nome: string;
  grupo: string | null;
  quantidade: number;
  unidade: string;
  precoCombinado: number | null;
  origemCombinado: PriceSource | null;
  precoCobrado: number;
  total: number;
};

function cleanString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Aceita número ou texto ("12,5"); devolve null se vazio e NaN se inválido. */
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === "string") {
    const text = value.trim().replace(",", ".");
    if (!text) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : Number.NaN;
  }
  return Number.NaN;
}

/** Valida e converte a lista de itens. Nunca lança: devolve o motivo em português. */
export function normalizeItems(raw: unknown): { ok: true; items: NormalizedItem[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Adicione pelo menos um item em “O que foi comprado”." };
  if (raw.length > MAX_ITEMS) return { ok: false, error: `Itens demais numa só compra (máximo ${MAX_ITEMS}).` };

  const items: NormalizedItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const label = `Item ${i + 1}`;
    if (!r || typeof r !== "object") return { ok: false, error: `${label}: inválido.` };
    const it = r as ItemInput;

    const kind = typeof it.kind === "string" && (ITEM_KINDS as readonly string[]).includes(it.kind) ? (it.kind as ItemKind) : null;
    if (!kind) return { ok: false, error: `${label}: tipo de item inválido.` };

    const nome = cleanString(it.nome, MAX_NAME);
    if (!nome) return { ok: false, error: `${label}: informe o nome do produto.` };

    let ingredientId: string | null = null;
    if (kind === "INSUMO") {
      if (typeof it.ingredientId !== "string" || !it.ingredientId.trim() || it.ingredientId.length > 100) {
        return { ok: false, error: `${label} (${nome}): escolha o insumo na lista.` };
      }
      ingredientId = it.ingredientId.trim();
    }

    const grupo = kind === "OUTRO" ? cleanString(it.grupo, MAX_GROUP) || "Outros" : null;

    let quantidade = 1;
    let unidade = "-";
    if (kind !== "AJUSTE") {
      const q = parseNumber(it.quantidade);
      if (q === null || Number.isNaN(q) || q <= 0 || q > MAX_VALUE) return { ok: false, error: `${label} (${nome}): informe uma quantidade maior que zero.` };
      quantidade = q;
      unidade = cleanString(it.unidade, MAX_UNIT);
      if (!unidade) return { ok: false, error: `${label} (${nome}): informe a unidade (kg, un, cx...).` };
    }

    const cobrado = parseNumber(it.precoCobrado);
    if (cobrado === null || Number.isNaN(cobrado) || Math.abs(cobrado) > MAX_VALUE) {
      return { ok: false, error: `${label} (${nome}): informe o valor cobrado.` };
    }
    if (kind !== "AJUSTE" && cobrado < 0) return { ok: false, error: `${label} (${nome}): o valor cobrado não pode ser negativo.` };

    let combinado = parseNumber(it.precoCombinado);
    if (Number.isNaN(combinado)) return { ok: false, error: `${label} (${nome}): preço combinado inválido.` };
    if (combinado !== null && (Math.abs(combinado) > MAX_VALUE || (kind !== "AJUSTE" && combinado < 0))) {
      return { ok: false, error: `${label} (${nome}): preço combinado inválido.` };
    }
    let origem: PriceSource | null = null;
    if (combinado === null) {
      // Frete/desconto sem combinado contam como R$ 0,00 combinado ("não combinado").
      if (kind === "AJUSTE") {
        combinado = 0;
        origem = "NAO_COMBINADO";
      }
    } else {
      origem =
        typeof it.origemCombinado === "string" && (PRICE_SOURCES as readonly string[]).includes(it.origemCombinado)
          ? (it.origemCombinado as PriceSource)
          : "MANUAL";
    }

    items.push({
      ordem: i,
      kind,
      ingredientId,
      nome,
      grupo,
      quantidade,
      unidade,
      precoCombinado: combinado,
      origemCombinado: origem,
      precoCobrado: cobrado,
      total: round2(quantidade * cobrado),
    });
  }
  return { ok: true, items };
}

export type InvoiceTotals = {
  /** Soma de tudo que foi cobrado (itens + ajustes). */
  totalCobrado: number;
  /** Soma de quantidade × combinado, só dos itens que tinham combinado. */
  totalCombinado: number;
  /** Soma do cobrado dos MESMOS itens (comparável com `totalCombinado`). */
  totalComparado: number;
  /** totalComparado − totalCombinado (positivo = veio acima do combinado). */
  diferenca: number;
  /** Diferença em % do combinado (null se nada foi combinado). */
  diferencaPct: number | null;
};

export function computeTotals(
  items: { quantidade: number; precoCombinado: number | null; precoCobrado: number; total: number }[]
): InvoiceTotals {
  let cobrado = 0;
  let combinado = 0;
  let comparado = 0;
  for (const it of items) {
    cobrado += it.total;
    if (it.precoCombinado !== null) {
      combinado += it.quantidade * it.precoCombinado;
      comparado += it.total;
    }
  }
  const totalCobrado = round2(cobrado);
  const totalCombinado = round2(combinado);
  const totalComparado = round2(comparado);
  const diferenca = round2(totalComparado - totalCombinado);
  return {
    totalCobrado,
    totalCombinado,
    totalComparado,
    diferenca,
    diferencaPct: totalCombinado > 0 ? round2((diferenca / totalCombinado) * 100) : null,
  };
}

/** A nota veio acima do combinado (além da tolerância de centavos)? */
export function isAboveAgreed(totals: Pick<InvoiceTotals, "diferenca">): boolean {
  return totals.diferenca > DIVERGENCE_TOLERANCE;
}

export type DiffBreakdown = {
  /** Preço unitário acima do combinado (itens, não ajustes). */
  precoAcima: number;
  /** Preço unitário abaixo do combinado (valor positivo = economia). */
  precoAbaixo: number;
  /** Frete/juros/desconto: cobrado − combinado dos ajustes. */
  ajustes: number;
};

export function diffBreakdown(
  items: { kind: ItemKind; quantidade: number; precoCombinado: number | null; total: number }[]
): DiffBreakdown {
  let acima = 0;
  let abaixo = 0;
  let ajustes = 0;
  for (const it of items) {
    if (it.precoCombinado === null) continue;
    const diff = it.total - it.quantidade * it.precoCombinado;
    if (it.kind === "AJUSTE") ajustes += diff;
    else if (diff > 0) acima += diff;
    else abaixo += -diff;
  }
  return { precoAcima: round2(acima), precoAbaixo: round2(abaixo), ajustes: round2(ajustes) };
}

/** Quanto do boleto está explicado pelos itens (0–100). */
export function detailPercent(totalCobrado: number, valorBoleto: number): number {
  if (!(valorBoleto > 0) || !(totalCobrado > 0)) return 0;
  return Math.min(100, Math.round((totalCobrado / valorBoleto) * 100));
}

/** Os itens fecham com o valor do boleto (até 5 centavos de diferença)? */
export function closesWithBoleto(totalCobrado: number, valorBoleto: number): boolean {
  return Math.abs(round2(totalCobrado) - round2(valorBoleto)) <= DIVERGENCE_TOLERANCE;
}

// ------------------------------------------------------------------------------------------------
// Decisão sobre a diferença (contestar × aceitar)
// ------------------------------------------------------------------------------------------------

export type DivergenceChoice = { acao?: unknown; motivo?: unknown; observacao?: unknown };

export type DivergenceDecision = {
  status: DivergenceStatus;
  motivo: string | null;
  observacao: string | null;
};

/**
 * Resolve o estado da diferença a gravar. Sem diferença acima do combinado não há o que decidir.
 * Acima do combinado, quem registra precisa escolher: contestar com o fornecedor ou aceitar com o motivo
 * (se a escolha não vier, mantém a que já estava gravada na compra, quando houver).
 */
export function resolveDivergence(
  above: boolean,
  choice: DivergenceChoice | null | undefined,
  current: { status: DivergenceStatus; motivo: string | null; observacao: string | null } | null
): { ok: true; decision: DivergenceDecision } | { ok: false; error: string } {
  if (!above) return { ok: true, decision: { status: "SEM_DIVERGENCIA", motivo: null, observacao: null } };

  const acao = typeof choice?.acao === "string" ? choice.acao : null;
  const observacao = cleanString(choice?.observacao, MAX_NOTE) || null;
  if (acao === "CONTESTAR") {
    return { ok: true, decision: { status: "EM_CONTESTACAO", motivo: null, observacao } };
  }
  if (acao === "ACEITAR") {
    const motivo = typeof choice?.motivo === "string" ? choice.motivo : "";
    if (!(DIVERGENCE_REASONS as readonly string[]).includes(motivo)) {
      return { ok: false, error: "Escolha o motivo para aceitar a diferença." };
    }
    if (motivo === "Outro" && (observacao ?? "").length < 3) {
      return { ok: false, error: "Explique o motivo na observação (escolheu “Outro”)." };
    }
    return { ok: true, decision: { status: "ACEITA", motivo, observacao } };
  }
  if (current && current.status !== "SEM_DIVERGENCIA") {
    return { ok: true, decision: { status: current.status, motivo: current.motivo, observacao: current.observacao } };
  }
  return { ok: false, error: "Esta compra veio acima do combinado: escolha “Contestar com o fornecedor” ou “Aceitar e registrar o motivo”." };
}

// ------------------------------------------------------------------------------------------------
// Histórico de preços do fornecedor (sugestão de "combinado" e "repetir última compra")
// ------------------------------------------------------------------------------------------------

/** Chave estável de um produto dentro das compras de um fornecedor. */
export function itemKey(item: { kind: string; ingredientId: string | null; nome: string; unidade: string }): string {
  if (item.kind === "INSUMO" && item.ingredientId) return `i:${item.ingredientId}`;
  const nome = item.nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return `n:${item.kind}:${nome}|${item.unidade.toLowerCase()}`;
}

export type HistoryInvoice = {
  id: string;
  dataCompra: Date;
  divergenciaStatus: DivergenceStatus;
  items: {
    kind: ItemKind;
    ingredientId: string | null;
    nome: string;
    grupo: string | null;
    quantidade: number;
    unidade: string;
    precoCombinado: number | null;
    origemCombinado: PriceSource | null;
    precoCobrado: number;
  }[];
};

export type PriceHint = { preco: number; origem: PriceSource; data: string };

/**
 * Último preço de cada produto: o do item mais recente. Numa compra EM CONTESTAÇÃO o preço de
 * referência é o combinado (o cobrado a mais está em disputa); nas outras, o que foi pago.
 * `invoices` vem da mais recente para a mais antiga.
 */
export function buildPriceHints(invoices: HistoryInvoice[]): Record<string, PriceHint> {
  const hints: Record<string, PriceHint> = {};
  for (const inv of invoices) {
    for (const it of inv.items) {
      if (it.kind === "AJUSTE") continue;
      const key = itemKey(it);
      if (hints[key]) continue;
      const contested = inv.divergenciaStatus === "EM_CONTESTACAO" && it.precoCombinado !== null;
      hints[key] = {
        preco: contested ? (it.precoCombinado as number) : it.precoCobrado,
        origem: "ULTIMO_PRECO",
        data: inv.dataCompra.toISOString(),
      };
    }
  }
  return hints;
}
