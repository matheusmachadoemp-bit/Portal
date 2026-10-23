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
/** Teto do total de UM item (quantidade × preço): acima disso é quase certo erro de digitação. */
const MAX_ITEM_TOTAL = 1_000_000_000;

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
  /// Categoria financeira (FinancialCategory) deste item — opcional, ver `NormalizedItem.categoriaId`.
  categoriaId?: unknown;
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
  /// Categoria financeira (DRE) deste item, escolhida por quem lança. Ausente (null) = o valor deste
  /// item cai na categoria do boleto (`Payable.categoriaId`) — ver `splitPayableByCategory`.
  categoriaId: string | null;
};

function cleanString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Número digitado: "12", "12,5" ou "12.5" (sem notação científica, hexadecimal nem separador de milhar). */
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/** Aceita número ou texto ("12,5"); devolve null se vazio e NaN se inválido. */
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (!PLAIN_NUMBER.test(text)) return Number.NaN;
    const n = Number(text.replace(",", "."));
    return Number.isFinite(n) ? n : Number.NaN;
  }
  return Number.NaN;
}

/** Chave estável do nome de um fornecedor: sem acento, minúsculas, espaços juntados. */
export function normalizeSupplierKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
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

    if (Math.abs(quantidade * cobrado) > MAX_ITEM_TOTAL) {
      return { ok: false, error: `${label} (${nome}): valor total do item grande demais. Confira quantidade e preço.` };
    }

    // Categoria financeira do item (opcional): só sanitiza o formato aqui (o mesmo padrão de
    // `ingredientId`/`supplierId` em outros pontos deste módulo) — se o id existe de verdade e está
    // ativo é responsabilidade de quem grava (`compra-itens-server.ts`), que tem acesso ao banco.
    let categoriaId: string | null = null;
    if (it.categoriaId !== undefined && it.categoriaId !== null && it.categoriaId !== "") {
      if (typeof it.categoriaId !== "string" || it.categoriaId.length > 100) {
        return { ok: false, error: `${label} (${nome}): categoria financeira inválida.` };
      }
      categoriaId = it.categoriaId;
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
      categoriaId,
    });
  }
  return { ok: true, items };
}

export type InvoiceTotals = {
  /** Soma de tudo que foi cobrado (itens + ajustes). */
  totalCobrado: number;
  /** Soma, só dos itens que tinham preço combinado, de quantidade × preço combinado (cada item em centavos). */
  totalCombinado: number;
  /** Soma do cobrado dos MESMOS itens (comparável com `totalCombinado`). */
  totalComparado: number;
  /** totalComparado − totalCombinado (positivo = veio acima do combinado). */
  diferenca: number;
  /** Diferença em % do combinado (null se nada foi combinado). */
  diferencaPct: number | null;
};

type TotalsItem = { kind?: ItemKind; quantidade: number; precoCombinado: number | null; precoCobrado: number; total: number };

/** O combinado de um item em centavos, igual ao `total` cobrado (os dois lados arredondam do mesmo jeito). */
function combinedTotal(it: { quantidade: number; precoCombinado: number | null }): number {
  return round2(it.quantidade * (it.precoCombinado ?? 0));
}

/**
 * Só dá para comparar com o combinado se pelo menos um PRODUTO tinha preço combinado. Frete/desconto
 * sozinhos (primeira compra de um fornecedor, sem nada combinado) não geram "acima do combinado".
 */
function hasComparableProduct(items: { kind?: ItemKind; precoCombinado: number | null }[]): boolean {
  return items.some((it) => it.kind !== "AJUSTE" && it.precoCombinado !== null);
}

export function computeTotals(items: TotalsItem[]): InvoiceTotals {
  let cobrado = 0;
  for (const it of items) cobrado += it.total;
  let combinado = 0;
  let comparado = 0;
  if (hasComparableProduct(items)) {
    for (const it of items) {
      if (it.precoCombinado === null) continue;
      combinado += combinedTotal(it);
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
  /** Frete/juros/desconto: cobrado − combinado dos ajustes (negativo = desconto acima do combinado). */
  ajustes: number;
};

export function diffBreakdown(
  items: { kind: ItemKind; quantidade: number; precoCombinado: number | null; total: number }[]
): DiffBreakdown {
  if (!hasComparableProduct(items)) return { precoAcima: 0, precoAbaixo: 0, ajustes: 0 };
  let acima = 0;
  let abaixo = 0;
  let ajustes = 0;
  for (const it of items) {
    if (it.precoCombinado === null) continue;
    const diff = round2(it.total - combinedTotal(it));
    if (it.kind === "AJUSTE") ajustes += diff;
    else if (diff > 0) acima += diff;
    else abaixo += -diff;
  }
  return { precoAcima: round2(acima), precoAbaixo: round2(abaixo), ajustes: round2(ajustes) };
}

/** Quanto do boleto está explicado pelos itens (0–100). */
export function detailPercent(totalCobrado: number, valorBoleto: number): number {
  if (!(valorBoleto > 0) || !(totalCobrado > 0)) return 0;
  // 100% só quando fecha de verdade: R$ 1.992 num boleto de R$ 2.000 mostra 99%, não 100%.
  const ratio = totalCobrado / valorBoleto;
  if (ratio >= 1 || closesWithBoleto(totalCobrado, valorBoleto)) return 100;
  return Math.min(99, Math.floor(ratio * 100));
}

/** Os itens fecham com o valor do boleto (até 5 centavos de diferença)? */
export function closesWithBoleto(totalCobrado: number, valorBoleto: number): boolean {
  return Math.abs(round2(totalCobrado) - round2(valorBoleto)) <= DIVERGENCE_TOLERANCE;
}

// ------------------------------------------------------------------------------------------------
// Categoria financeira por item (contas a pagar multi-categoria)
// ------------------------------------------------------------------------------------------------

export type PayableCategorySplitItem = { categoriaId: string | null; total: number };
export type PayableCategorySplit = { categoriaId: string; valor: number };

/**
 * Reparte o valor de UM boleto pelas categorias financeiras escolhidas item a item (ver
 * `SupplierInvoiceItem.categoriaId`), preservando sempre a soma total = `valor` — nenhum centavo é
 * perdido ou duplicado, mesmo quando os itens não "fecham" com o boleto (ver `closesWithBoleto`,
 * que aqui NUNCA trava: a diferença só muda para qual categoria ela é contada).
 *
 * Regra (divisão proporcional): cada item com `categoriaId` preenchido recebe uma fatia de `valor`
 * proporcional ao seu peso (`total`) dentro da soma de TODOS os itens (categorizados ou não). A
 * fatia que sobra — a fração do peso que NÃO tinha categoria escolhida — cai na categoria do
 * próprio boleto (`categoriaIdBoleto`), o mesmo lugar onde o valor inteiro cairia se ninguém
 * tivesse categorizado nenhum item. Repare que isso também carrega, PROPORCIONALMENTE, a diferença
 * entre o total dos itens e o valor do boleto (o "gap"): se 100% do peso dos itens já tem categoria
 * escolhida, 100% do valor do boleto — gap incluído — segue essas categorias (nada fica pra
 * categoria do boleto, mesmo que os itens não fechem exatamente com o valor); só quando existe peso
 * SEM categoria é que uma fração do gap acaba sobrando pra categoria do boleto.
 *
 * Sem nenhum item categorizado (ou sem itens, ou itens somando zero): devolve exatamente
 * `[{ categoriaId: categoriaIdBoleto, valor }]` — o comportamento de sempre, idêntico ao de antes
 * desta função existir, para todo o histórico já lançado. É isso que DRE (`dre.ts`), Fluxo de Caixa
 * (`fluxo-caixa-server.ts`) e o gráfico do Dashboard Financeiro devem usar — os três com a MESMA
 * função, para nunca contarem histórias diferentes do mesmo boleto.
 */
export function splitPayableByCategory(
  valor: number,
  categoriaIdBoleto: string,
  items: PayableCategorySplitItem[]
): PayableCategorySplit[] {
  const totalItens = round2(items.reduce((acc, it) => acc + it.total, 0));
  const hasCategorized = items.some((it) => it.categoriaId);
  if (!hasCategorized || totalItens === 0) {
    return [{ categoriaId: categoriaIdBoleto, valor: round2(valor) }];
  }

  const porCategoria = new Map<string, number>();
  let alocado = 0;
  for (const it of items) {
    if (!it.categoriaId) continue;
    const fatia = round2((it.total / totalItens) * valor);
    porCategoria.set(it.categoriaId, round2((porCategoria.get(it.categoriaId) ?? 0) + fatia));
    alocado = round2(alocado + fatia);
  }
  // Itens sem categoria escolhida + o que sobrar do arredondamento/diferença contra o valor do
  // boleto: tudo cai na categoria do próprio boleto (soma com o que ela já tiver recebido, se ela
  // também apareceu categorizada em algum item).
  const resto = round2(valor - alocado);
  porCategoria.set(categoriaIdBoleto, round2((porCategoria.get(categoriaIdBoleto) ?? 0) + resto));

  // Categoria com fatia zero (ex.: todos os itens fecharam certinho noutra categoria, sem sobra
  // nenhuma pra categoria do boleto) não precisa aparecer — mas o array nunca fica vazio: sem
  // nenhuma fatia de verdade, cai de volta no comportamento de sempre (categoria do boleto = valor
  // inteiro), nunca "some" o valor do boleto.
  const resultado = [...porCategoria.entries()]
    .filter(([, valorCategoria]) => Math.abs(valorCategoria) > 0.004)
    .map(([categoriaId, valorCategoria]) => ({ categoriaId, valor: valorCategoria }));
  return resultado.length > 0 ? resultado : [{ categoriaId: categoriaIdBoleto, valor: round2(valor) }];
}

// ------------------------------------------------------------------------------------------------
// Decisão sobre a diferença (contestar × aceitar)
// ------------------------------------------------------------------------------------------------

export type DivergenceChoice = { acao?: unknown; motivo?: unknown; observacao?: unknown };

export type DivergenceDecision = {
  status: DivergenceStatus;
  motivo: string | null;
  observacao: string | null;
  /** Diferença (R$ acima do combinado) no momento da escolha. */
  valor: number;
};

/**
 * Resolve o estado da diferença a gravar. Sem diferença acima do combinado não há o que decidir.
 * Acima do combinado, quem registra precisa escolher: contestar com o fornecedor ou aceitar com o motivo.
 * Se a escolha não vier, mantém a que já estava gravada na compra — mas só enquanto a diferença não
 * tiver crescido desde então (aceitar R$ 35 não vale para R$ 620).
 */
export function resolveDivergence(
  above: boolean,
  choice: DivergenceChoice | null | undefined,
  current: { status: DivergenceStatus; motivo: string | null; observacao: string | null; valor: number } | null,
  diferenca: number
): { ok: true; decision: DivergenceDecision } | { ok: false; error: string } {
  if (!above) return { ok: true, decision: { status: "SEM_DIVERGENCIA", motivo: null, observacao: null, valor: 0 } };

  const acao = typeof choice?.acao === "string" ? choice.acao : null;
  const observacao = cleanString(choice?.observacao, MAX_NOTE) || null;
  if (acao === "CONTESTAR") {
    return { ok: true, decision: { status: "EM_CONTESTACAO", motivo: null, observacao, valor: diferenca } };
  }
  if (acao === "ACEITAR") {
    const motivo = typeof choice?.motivo === "string" ? choice.motivo : "";
    if (!(DIVERGENCE_REASONS as readonly string[]).includes(motivo)) {
      return { ok: false, error: "Escolha o motivo para aceitar a diferença." };
    }
    if (motivo === "Outro" && (observacao ?? "").length < 3) {
      return { ok: false, error: "Explique o motivo na observação (escolheu “Outro”)." };
    }
    return { ok: true, decision: { status: "ACEITA", motivo, observacao, valor: diferenca } };
  }
  if (current && current.status !== "SEM_DIVERGENCIA") {
    if (diferenca > current.valor + DIVERGENCE_TOLERANCE) {
      return {
        ok: false,
        error: `A diferença aumentou (de R$ ${current.valor.toFixed(2).replace(".", ",")} para R$ ${diferenca.toFixed(2).replace(".", ",")}) desde a última escolha. Escolha de novo: contestar ou aceitar.`,
      };
    }
    return { ok: true, decision: { status: current.status, motivo: current.motivo, observacao: current.observacao, valor: current.valor } };
  }
  return { ok: false, error: "Esta compra veio acima do combinado: escolha “Contestar com o fornecedor” ou “Aceitar e registrar o motivo”." };
}

// ------------------------------------------------------------------------------------------------
// Histórico de preços do fornecedor (sugestão de "combinado" e "repetir última compra")
// ------------------------------------------------------------------------------------------------

/** Chave estável de um produto dentro das compras de um fornecedor. */
export function itemKey(item: { kind: string; ingredientId: string | null; nome: string; unidade: string }): string {
  // O insumo vale por id E unidade: o preço por kg não serve de referência para a caixa.
  if (item.kind === "INSUMO" && item.ingredientId) return `i:${item.ingredientId}|${item.unidade.trim().toLowerCase()}`;
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
      // Item de preço zero (bonificação/brinde) não serve de referência: segue para a compra anterior.
      if (it.precoCobrado <= 0 && !(inv.divergenciaStatus === "EM_CONTESTACAO" && (it.precoCombinado ?? 0) > 0)) continue;
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
