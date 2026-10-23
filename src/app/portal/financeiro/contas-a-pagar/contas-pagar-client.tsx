"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Check, Download, Copy, Repeat, ScanBarcode, AlertTriangle } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { PeriodFilterBar } from "@/components/ui/period-filter";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/calc";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { spDateKey, storedDayKey } from "@/lib/timezone";
import { apiRequest } from "@/lib/api-client";
import { DUE_DATE_FILTER_OPTIONS, matchesDueDateFilter, type DueDateFilterKey } from "@/lib/due-date-filter";
import { detailPercent, isAboveAgreed, itemKey, normalizeItems, computeTotals, round2, type PriceHint } from "@/lib/compra-itens";
import { normalizeScannedCode, extractBoletoFields } from "@/lib/boleto-barcode";
import {
  CompraItensEditor,
  EMPTY_DECISION,
  draftFromSaved,
  draftsToPayload,
  summarize,
  type DecisionState,
  type DraftItem,
  type IngredientOption,
  type LastPurchase,
  type SavedItem,
} from "./compra-itens-editor";

/** Mesmo formato de `PayableDuplicateInfo` (ver `src/lib/boleto-barcode-server.ts`), devolvido
 *  pela checagem de duplicidade de código de barras/Pix. */
type CodigoBarrasDuplicate =
  | {
      visible: true;
      id: string;
      number: string;
      fornecedor: string;
      valor: number;
      dataVencimento: string;
      status: string;
      empresa: string;
    }
  | { visible: false };

type PayableDTO = {
  id: string;
  number: string;
  fornecedor: string;
  descricao: string;
  categoriaId: string;
  categoria: { name: string; dreKey: string };
  centroCusto: string | null;
  empresa: { id: string; name: string; color: string };
  valor: number;
  dataCompetencia: string;
  dataVencimento: string;
  dataPagamento: string | null;
  bankAccountId: string | null;
  bankAccount: { name: string } | null;
  formaPagamento: string | null;
  parcelado: boolean;
  quantidadeParcelas: number | null;
  parcelaAtual: number | null;
  observacoes: string | null;
  status: string;
  /** Código de barras do boleto (ou Pix "copia e cola") bipado com o leitor físico ou digitado ao cadastrar — ver boleto-barcode.ts. */
  codigoBarras: string | null;
  /** Resumo da compra (“o que foi comprado”) ligada à conta, se houver. */
  invoice: InvoiceSummary | null;
};

type InvoiceSummary = {
  id: string;
  numeroNota: string | null;
  totalCobrado: number;
  totalCombinado: number;
  totalComparado: number;
  divergenciaStatus: "SEM_DIVERGENCIA" | "EM_CONTESTACAO" | "ACEITA";
  divergenciaMotivo: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  EM_ABERTO: "Em aberto",
  PAGO: "Pago",
  PARCIALMENTE_PAGO: "Parcialmente pago",
  CANCELADO: "Cancelado",
  ATRASADO: "Atrasado",
};

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  EM_ABERTO: "info",
  PAGO: "success",
  PARCIALMENTE_PAGO: "warning",
  CANCELADO: "default",
  ATRASADO: "danger",
};

const PAYMENT_METHODS = [
  "PIX",
  "DINHEIRO",
  "CARTAO_DEBITO",
  "CARTAO_CREDITO",
  "TED",
  "DOC",
  "TRANSFERENCIA",
  "CHEQUE",
  "BOLETO",
  "OUTRO",
];

const emptyForm = {
  number: "",
  fornecedor: "",
  descricao: "",
  categoriaId: "",
  centroCusto: "",
  valor: "",
  dataCompetencia: format(new Date(), "yyyy-MM-dd"),
  dataVencimento: format(new Date(), "yyyy-MM-dd"),
  dataPagamento: "",
  bankAccountId: "",
  formaPagamento: "PIX",
  parcelado: false,
  quantidadeParcelas: "",
  parcelaAtual: "",
  observacoes: "",
  status: "EM_ABERTO",
  codigoBarras: "",
};

export function ContasPagarClient({
  initialPayables,
  categorias,
  contas,
  fornecedoresCadastrados,
  ingredients = [],
  canCreateSupplier = false,
  canCreate = true,
  isGrupoNordMode = true,
}: {
  initialPayables: PayableDTO[];
  categorias: { id: string; name: string; dreKey: string }[];
  contas: { id: string; name: string }[];
  /** Cadastro de fornecedores (Estoque > Fornecedores) — só alimenta a sugestão do campo "Fornecedor", ver `fornecedorSugestoes`. */
  fornecedoresCadastrados: { id: string; name: string }[];
  /** Insumos da loja (Estoque) para escolher em “O que foi comprado”. */
  ingredients?: IngredientOption[];
  /** O perfil pode cadastrar fornecedor (Estoque) — habilita “Cadastrar como novo fornecedor” no formulário. */
  canCreateSupplier?: boolean;
  canCreate?: boolean;
  /** Diferencia por que `canCreate` é falso: modo Grupo Nord (consolidado) ou permissão do perfil numa loja específica. */
  isGrupoNordMode?: boolean;
}) {
  const [payables, setPayables] = useState(initialPayables);
  const [suppliers, setSuppliers] = useState(fornecedoresCadastrados);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PayableDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingRecurring, setSavingRecurring] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [filterVencimento, setFilterVencimento] = useState<DueDateFilterKey>("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [quickFilter, setQuickFilter] = useState<"" | "SEM_ITENS" | "ACIMA" | "CONTESTACAO">("");
  const [showAboveModal, setShowAboveModal] = useState(false);
  // “O que foi comprado” (itens da nota) do formulário aberto.
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  // Espelho de `drafts` para as respostas assíncronas (histórico) enxergarem os itens de agora, não os de quando a busca começou.
  const draftsRef = useRef<DraftItem[]>([]);
  const [numeroNota, setNumeroNota] = useState("");
  const [decision, setDecision] = useState<DecisionState>(EMPTY_DECISION);
  const [hadCompra, setHadCompra] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadingCompra, setLoadingCompra] = useState(false);
  const [compraLoadFailed, setCompraLoadFailed] = useState(false);
  const [hints, setHints] = useState<Record<string, PriceHint>>({});
  const [lastPurchase, setLastPurchase] = useState<LastPurchase | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ razaoSocial: "", cnpj: "", telefone: "" });
  const [newSupplierError, setNewSupplierError] = useState<string | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [decidedDiff, setDecidedDiff] = useState(0);
  const [autoPagamento, setAutoPagamento] = useState(false);
  const [repriceNote, setRepriceNote] = useState<string | null>(null);
  // Código de barras do boleto / Pix bipado com o leitor físico ou digitado (ver boleto-barcode.ts).
  const codigoBarrasInputRef = useRef<HTMLInputElement>(null);
  const [codigoBarrasDuplicate, setCodigoBarrasDuplicate] = useState<CodigoBarrasDuplicate | null>(null);
  const [checkingCodigo, setCheckingCodigo] = useState(false);
  const [codigoBarrasNote, setCodigoBarrasNote] = useState<string | null>(null);
  const [copiedCodigoId, setCopiedCodigoId] = useState<string | null>(null);
  const codigoCheckSeq = useRef(0);
  const historyKey = useRef("");
  const historySeq = useRef(0);
  const historyExtras = useRef<{ exclude: string | null; until: string | null }>({ exclude: null, until: null });
  const compraSeq = useRef(0);
  const initialDates = useRef({ dataCompetencia: "", dataVencimento: "", dataPagamento: "" });
  const errorRef = useRef<HTMLDivElement>(null);
  const [showRecurring, setShowRecurring] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    descricao: "",
    fornecedorCliente: "",
    categoriaId: categorias[0]?.id ?? "",
    centroCusto: "",
    valor: "",
    diaVencimento: "10",
    bankAccountId: contas[0]?.id ?? "",
    formaPagamento: "PIX",
    infinita: true,
    quantidadeMeses: "12",
    dataInicio: format(new Date(), "yyyy-MM-dd"),
  });

  // Sugestões pro campo "Fornecedor" (autocomplete via <datalist>, sem travar o campo — ainda
  // aceita digitar um nome novo): combina o cadastro formal de fornecedores (Estoque >
  // Fornecedores) com os nomes já usados nos lançamentos existentes, pra sugerir recorrentes
  // sem cadastro formal também (ex.: "sandro Proprietario").
  const fornecedorSugestoes = useMemo(() => {
    const nomes = new Set<string>();
    for (const f of suppliers) {
      const nome = f.name.trim();
      if (nome) nomes.add(nome);
    }
    for (const p of payables) {
      const nome = p.fornecedor.trim();
      if (nome) nomes.add(nome);
    }
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [suppliers, payables]);

  const filtered = useMemo(
    () =>
      payables
        .filter((p) => !filterStatus || p.status === filterStatus)
        .filter((p) => matchesDueDateFilter(new Date(p.dataVencimento), p.status, filterVencimento, { from: customFrom, to: customTo }, ["PAGO", "CANCELADO"]))
        .filter(
          (p) =>
            !search ||
            p.fornecedor.toLowerCase().includes(search.toLowerCase()) ||
            p.descricao.toLowerCase().includes(search.toLowerCase())
        )
        .filter((p) => {
          if (quickFilter === "SEM_ITENS") return !p.invoice;
          if (quickFilter === "ACIMA") return !!p.invoice && isAboveAgreed({ diferenca: round2(p.invoice.totalComparado - p.invoice.totalCombinado) });
          if (quickFilter === "CONTESTACAO") return p.invoice?.divergenciaStatus === "EM_CONTESTACAO";
          return true;
        }),
    [payables, filterStatus, filterVencimento, customFrom, customTo, search, quickFilter]
  );

  // Indicadores do topo (sobre as contas carregadas: de 120 dias atrás em diante).
  const kpis = useMemo(() => {
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    const month = today.slice(0, 7);
    let monthTotal = 0;
    let monthDetailed = 0;
    let aboveValue = 0;
    let aboveCount = 0;
    const aboveList: { payable: PayableDTO; diff: number }[] = [];
    let contestedValue = 0;
    let contestedCount = 0;
    let dueInPeriod = 0;
    for (const p of payables) {
      if (p.status === "CANCELADO") continue;
      const inv = p.invoice;
      if (format(new Date(p.dataCompetencia), "yyyy-MM-dd").startsWith(month)) {
        monthTotal += p.valor;
        if (inv) monthDetailed += Math.min(inv.totalCobrado, p.valor);
        const diff = inv ? round2(inv.totalComparado - inv.totalCombinado) : 0;
        if (inv && isAboveAgreed({ diferenca: diff })) {
          aboveValue += diff;
          aboveCount += 1;
          aboveList.push({ payable: p, diff });
        }
      }
      if (inv?.divergenciaStatus === "EM_CONTESTACAO") {
        contestedCount += 1;
        contestedValue += Math.max(0, round2(inv.totalComparado - inv.totalCombinado));
      }
      // Valor ainda a pagar (não cancelado, não pago) dentro do filtro de vencimento ativo na tela
      // (mesma função que filtra a lista abaixo) — acompanha o filtro em vez de uma janela fixa.
      if (
        p.status !== "PAGO" &&
        matchesDueDateFilter(new Date(p.dataVencimento), p.status, filterVencimento, { from: customFrom, to: customTo }, ["PAGO", "CANCELADO"], now)
      ) {
        dueInPeriod += p.valor;
      }
    }
    return {
      detailedPct: monthTotal > 0 ? Math.round((monthDetailed / monthTotal) * 100) : 0,
      aboveValue,
      aboveCount,
      aboveList,
      contestedValue,
      contestedCount,
      dueInPeriod,
      // Só a primeira letra maiúscula ("Outubro de 2026", não "Outubro De 2026" — o `date-fns`
      // devolve tudo minúsculo e um `capitalize` do Tailwind maiusculizaria cada palavra, inclusive o "de").
      monthLabel: capitalizeFirst(format(now, "MMMM 'de' yyyy", { locale: ptBR })),
    };
  }, [payables, filterVencimento, customFrom, customTo]);

  const totalFiltrado = filtered.reduce((a, p) => a + p.valor, 0);

  async function refresh() {
    const res = await fetch("/api/financeiro/pagar");
    const data = await res.json();
    setPayables(data.payables);
  }

  /** Aplica o preset (ou intervalo personalizado) escolhido na fileira de botões de vencimento. */
  function applyVencimento(key: DueDateFilterKey, from?: string, to?: string) {
    setFilterVencimento(key);
    setCustomFrom(from ?? "");
    setCustomTo(to ?? "");
  }

  // Rótulo do filtro de vencimento ativo, para o card "A pagar no período selecionado" refletir
  // dinamicamente a opção escolhida (inclusive o intervalo exato, quando é "Personalizado").
  const vencimentoFiltroLabel =
    filterVencimento === "personalizado" && customFrom && customTo
      ? `${formatDateKeyBR(customFrom)} a ${formatDateKeyBR(customTo)}`
      : DUE_DATE_FILTER_OPTIONS.find((o) => o.key === filterVencimento)?.label ?? "Todos os vencimentos";

  function resetCompra() {
    setSupplierId(null);
    putDrafts([]);
    setNumeroNota("");
    setDecision(EMPTY_DECISION);
    setHadCompra(false);
    setDirty(false);
    setLoadingCompra(false);
    setCompraLoadFailed(false);
    setHints({});
    setLastPurchase(null);
    setLoadingHistory(false);
    setNewSupplierOpen(false);
    setNewSupplierError(null);
    setDecidedDiff(0);
    setAutoPagamento(false);
    setRepriceNote(null);
    historyKey.current = "";
    historySeq.current += 1;
    compraSeq.current += 1;
    historyExtras.current = { exclude: null, until: null };
  }

  function resetCodigoBarras() {
    setCodigoBarrasDuplicate(null);
    setCheckingCodigo(false);
    setCodigoBarrasNote(null);
    codigoCheckSeq.current += 1;
  }

  /** Checa se o código já está cadastrado em outro lançamento — ver `/api/financeiro/pagar/codigo-barras`.
   *  Chamada ao sair do campo (onBlur) e logo depois de "bipar" o leitor físico (onKeyDown Enter) —
   *  ver `applyCodigoBarras` abaixo. */
  async function checkCodigoDuplicate(rawCode: string) {
    const code = normalizeScannedCode(rawCode);
    if (!code) {
      setCodigoBarrasDuplicate(null);
      return;
    }
    const mine = ++codigoCheckSeq.current;
    setCheckingCodigo(true);
    const params = new URLSearchParams({ codigo: code });
    if (editing) params.set("excludeId", editing.id);
    const result = await apiRequest<{ duplicate: CodigoBarrasDuplicate | null }>(
      `/api/financeiro/pagar/codigo-barras?${params.toString()}`,
      "GET"
    );
    if (mine !== codigoCheckSeq.current) return; // chegou uma checagem mais nova nesse meio-tempo
    setCheckingCodigo(false);
    if (result.ok) setCodigoBarrasDuplicate(result.data.duplicate);
  }

  /** Chamada ao "bipar" o código no leitor físico (Enter, ver onKeyDown do campo) ou ao sair do
   *  campo (onBlur), nos dois casos depois de digitar/colar manualmente também: normaliza o código,
   *  tenta extrair valor/vencimento (boleto bancário/arrecadação — ver `extractBoletoFields`) e já
   *  checa duplicidade. */
  function applyCodigoBarras(raw: string) {
    const code = normalizeScannedCode(raw);
    const extracted = extractBoletoFields(code);
    setForm((f) => ({
      ...f,
      codigoBarras: code,
      ...(extracted ? { valor: String(round2(extracted.valor)) } : {}),
      ...(extracted?.vencimento ? { dataVencimento: format(extracted.vencimento, "yyyy-MM-dd") } : {}),
    }));
    setCodigoBarrasNote(
      extracted
        ? `Valor${extracted.vencimento ? " e vencimento" : ""} preenchidos automaticamente a partir do código lido — confira antes de salvar.`
        : null
    );
    checkCodigoDuplicate(code);
  }

  async function copyCode(id: string, code: string) {
    await navigator.clipboard.writeText(code);
    setCopiedCodigoId(id);
    setTimeout(() => setCopiedCodigoId(null), 1500);
  }

  function putDrafts(next: DraftItem[]) {
    draftsRef.current = next;
    setDrafts(next);
  }

  /** Mostra o erro do formulário junto ao botão Salvar (o formulário é alto) e garante que fique à vista. */
  function fail(message: string) {
    setFormError(message);
    requestAnimationFrame(() => errorRef.current?.scrollIntoView({ block: "nearest" }));
  }

  function findSupplier(name: string) {
    const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const wanted = norm(name);
    if (!wanted) return null;
    return suppliers.find((f) => norm(f.name) === wanted) ?? null;
  }

  /**
   * Compras anteriores deste fornecedor (última compra + último preço de cada produto).
   * `recompute`: o usuário TROCOU o fornecedor — os itens com “último preço pago” do fornecedor anterior
   * passam para o preço do novo (ou ficam sem combinado, se o novo não tem histórico do produto).
   */
  async function loadHistory(name: string, id: string | null, recompute = false) {
    const clean = name.trim();
    if (!clean) return;
    const key = `${id ?? ""}|${clean.toLowerCase()}`;
    if (historyKey.current === key) return;
    historyKey.current = key;
    const seq = ++historySeq.current;
    setHints({});
    setLastPurchase(null);
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams({ fornecedor: clean });
      if (id) params.set("supplierId", id);
      if (historyExtras.current.exclude) params.set("excludeInvoiceId", historyExtras.current.exclude);
      if (historyExtras.current.until) params.set("ate", historyExtras.current.until);
      const res = await fetch(`/api/financeiro/pagar/historico?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (seq !== historySeq.current) return; // chegou uma busca mais nova
      const newHints: Record<string, PriceHint> = res.ok ? data.hints ?? {} : {};
      if (res.ok) {
        setHints(newHints);
        setLastPurchase(data.ultimaCompra ?? null);
      }
      if (recompute) {
        const prev = draftsRef.current;
        const next = prev.map((d) => {
          if (d.kind === "AJUSTE" || d.origemCombinado !== "ULTIMO_PRECO") return d;
          const hint = newHints[itemKey({ kind: d.kind, ingredientId: d.ingredientId, nome: d.nome, unidade: d.unidade })];
          return hint ? { ...d, precoCombinado: String(hint.preco) } : { ...d, precoCombinado: "", origemCombinado: null };
        });
        const changed = next.some((d, i) => d !== prev[i]);
        if (changed) putDrafts(next);
        setRepriceNote(changed ? "Você trocou o fornecedor: os preços combinados que vinham do “último preço pago” foram atualizados para o novo fornecedor." : null);
      }
    } catch {
      // sem histórico: o formulário continua funcionando (só sem sugestões)
    } finally {
      if (seq === historySeq.current) setLoadingHistory(false);
    }
  }

  function onFornecedorChange(value: string) {
    setForm((f) => ({ ...f, fornecedor: value }));
    const match = findSupplier(value);
    setSupplierId(match?.id ?? null);
    if (match) loadHistory(match.name, match.id, true);
    else if (value.trim() === "") {
      // campo esvaziado: as sugestões do fornecedor anterior não valem mais
      historyKey.current = "";
      historySeq.current += 1;
      setHints({});
      setLastPurchase(null);
      setLoadingHistory(false);
    }
  }

  function openNewSupplierPanel() {
    setNewSupplier({ razaoSocial: form.fornecedor.trim(), cnpj: "", telefone: "" });
    setNewSupplierError(null);
    setNewSupplierOpen(true);
  }

  async function saveNewSupplier() {
    if (savingSupplier) return;
    if (!newSupplier.razaoSocial.trim()) {
      setNewSupplierError("Informe o nome do fornecedor.");
      return;
    }
    setSavingSupplier(true);
    setNewSupplierError(null);
    const result = await apiRequest<{ supplier: { id: string; razaoSocial: string; nomeFantasia: string | null } }>(
      "/api/estoque/fornecedores",
      "POST",
      { razaoSocial: newSupplier.razaoSocial.trim(), cnpj: newSupplier.cnpj.trim(), telefone: newSupplier.telefone.trim() }
    );
    setSavingSupplier(false);
    if (!result.ok) {
      setNewSupplierError(result.error);
      return;
    }
    const created = result.data.supplier;
    const name = created.nomeFantasia ?? created.razaoSocial;
    setSuppliers((list) => [...list, { id: created.id, name }].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    setForm((f) => ({ ...f, fornecedor: name }));
    setSupplierId(created.id);
    setNewSupplierOpen(false);
    loadHistory(name, created.id, true);
  }

  function openNew() {
    setEditing(null);
    resetCompra();
    resetCodigoBarras();
    setFormError(null);
    setForm({ ...emptyForm, categoriaId: categorias[0]?.id ?? "", bankAccountId: contas[0]?.id ?? "" });
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return; // fechar no meio do salvamento esconderia um erro e passaria a ideia de que salvou
    if (dirty && drafts.length > 0) setConfirmDiscard(true);
    else setShowForm(false);
  }

  // Ao abrir "Nova conta a pagar" (não ao editar, onde o fornecedor já vem preenchido), foca direto
  // no campo de código de barras: quem usa o leitor físico de código de barras (aparelho tipo
  // pistola, USB, "digita" os caracteres e aperta Enter sozinho) pode bipar o boleto assim que a
  // tela abre, sem precisar clicar no campo primeiro. Roda depois do foco padrão do Modal (que foca
  // o primeiro elemento focável do diálogo, normalmente o botão de fechar "X") porque este
  // componente é o pai do `Modal` na árvore — efeitos de componentes filhos disparam antes dos do
  // pai no mesmo commit — então este .focus() sempre vence por último.
  useEffect(() => {
    if (showForm && !editing) codigoBarrasInputRef.current?.focus();
  }, [showForm, editing]);

  /** Mexeu nos itens: se a diferença passou do que já tinha sido contestado/aceito, a escolha antiga não vale mais. */
  function changeDrafts(next: DraftItem[]) {
    putDrafts(next);
    setDirty(true);
    if (decision.acao && summarize(next).totals.diferenca > decidedDiff + 0.05) setDecision(EMPTY_DECISION);
  }

  function changeDecision(d: DecisionState) {
    setDecision(d);
    setDirty(true);
    if (d.acao && d.acao !== decision.acao) setDecidedDiff(summarize(drafts).totals.diferenca);
  }

  /** Abre a conta já com os itens gravados (buscados à parte, para a lista ficar leve). */
  async function loadCompraOf(p: PayableDTO) {
    const mine = ++compraSeq.current;
    setLoadingCompra(true);
    setCompraLoadFailed(false);
    try {
      const res = await fetch(`/api/financeiro/pagar/${p.id}/compra`);
      const data = await res.json().catch(() => ({}));
      if (mine !== compraSeq.current) return; // outra conta foi aberta nesse meio-tempo
      if (!res.ok) throw new Error("falha");
      if (!data.compra) {
        // a compra deixou de existir (apagada por outra pessoa): a conta fica sem itens
        setHadCompra(false);
        return;
      }
      const c = data.compra as {
        supplierId: string | null;
        numeroNota: string | null;
        divergenciaStatus: "SEM_DIVERGENCIA" | "EM_CONTESTACAO" | "ACEITA";
        divergenciaMotivo: string | null;
        divergenciaObservacao: string | null;
        divergenciaValor: number;
        itens: SavedItem[];
      };
      const supplier = c.supplierId ?? findSupplier(p.fornecedor)?.id ?? null;
      putDrafts(c.itens.map(draftFromSaved));
      setNumeroNota(c.numeroNota ?? "");
      setSupplierId(supplier);
      setDecidedDiff(c.divergenciaValor ?? 0);
      setDecision(
        c.divergenciaStatus === "EM_CONTESTACAO"
          ? { acao: "CONTESTAR", motivo: "", observacao: c.divergenciaObservacao ?? "" }
          : c.divergenciaStatus === "ACEITA"
            ? { acao: "ACEITAR", motivo: c.divergenciaMotivo ?? "", observacao: c.divergenciaObservacao ?? "" }
            : EMPTY_DECISION
      );
      loadHistory(p.fornecedor, supplier);
    } catch {
      if (mine === compraSeq.current) setCompraLoadFailed(true);
    } finally {
      if (mine === compraSeq.current) setLoadingCompra(false);
    }
  }

  function openEdit(p: PayableDTO) {
    setEditing(p);
    setForm({
      number: p.number,
      fornecedor: p.fornecedor,
      descricao: p.descricao,
      categoriaId: p.categoriaId,
      centroCusto: p.centroCusto ?? "",
      valor: String(p.valor),
      dataCompetencia: format(new Date(p.dataCompetencia), "yyyy-MM-dd"),
      dataVencimento: format(new Date(p.dataVencimento), "yyyy-MM-dd"),
      dataPagamento: p.dataPagamento ? format(new Date(p.dataPagamento), "yyyy-MM-dd") : "",
      bankAccountId: p.bankAccountId ?? "",
      formaPagamento: p.formaPagamento ?? "PIX",
      parcelado: p.parcelado,
      quantidadeParcelas: p.quantidadeParcelas ? String(p.quantidadeParcelas) : "",
      parcelaAtual: p.parcelaAtual ? String(p.parcelaAtual) : "",
      observacoes: p.observacoes ?? "",
      status: p.status,
      codigoBarras: p.codigoBarras ?? "",
    });
    resetCompra();
    resetCodigoBarras();
    setFormError(null);
    setSupplierId(findSupplier(p.fornecedor)?.id ?? null);
    setHadCompra(!!p.invoice);
    initialDates.current = {
      dataCompetencia: format(new Date(p.dataCompetencia), "yyyy-MM-dd"),
      dataVencimento: format(new Date(p.dataVencimento), "yyyy-MM-dd"),
      dataPagamento: p.dataPagamento ? format(new Date(p.dataPagamento), "yyyy-MM-dd") : "",
    };
    // Ao editar uma conta antiga: o histórico não inclui a própria compra nem o que veio depois dela.
    historyExtras.current = { exclude: p.invoice?.id ?? null, until: initialDates.current.dataCompetencia };
    setShowForm(true);
    if (p.invoice) loadCompraOf(p);
    else loadHistory(p.fornecedor, findSupplier(p.fornecedor)?.id ?? null);
  }

  async function submit() {
    if (saving) return;
    if (!form.fornecedor.trim()) {
      fail("Informe o fornecedor.");
      return;
    }
    if (!form.descricao.trim()) {
      fail("Informe a descrição.");
      return;
    }
    if (!form.categoriaId) {
      fail("Selecione uma categoria financeira antes de salvar.");
      return;
    }
    if (!form.valor || Number(form.valor) <= 0) {
      fail("Informe um valor maior que zero.");
      return;
    }
    if (loadingCompra || compraLoadFailed) {
      fail(
        compraLoadFailed
          ? "Não foi possível carregar os itens desta conta. Feche e abra de novo antes de salvar (assim nenhum item se perde)."
          : "Aguarde os itens carregarem."
      );
      return;
    }
    if (checkingCodigo) {
      fail("Aguarde a checagem do código de barras/Pix.");
      return;
    }
    if (codigoBarrasDuplicate) {
      fail("Este código de barras/Pix já está cadastrado em outro lançamento. Resolva a duplicidade antes de salvar.");
      return;
    }

    // “O que foi comprado”: ausente = não mexe; vazio numa conta que tinha itens = remove; com itens = grava.
    let compra: unknown = undefined;
    if (drafts.length > 0) {
      const itens = draftsToPayload(drafts);
      const parsed = normalizeItems(itens);
      if (!parsed.ok) {
        fail(parsed.error);
        return;
      }
      const above = isAboveAgreed(computeTotals(parsed.items));
      if (above) {
        if (!decision.acao) {
          fail("Esta compra veio acima do combinado: escolha “Contestar com o fornecedor” ou “Aceitar e registrar o motivo”.");
          return;
        }
        if (decision.acao === "ACEITAR" && !decision.motivo) {
          fail("Escolha o motivo para aceitar a diferença.");
          return;
        }
        if (decision.acao === "ACEITAR" && decision.motivo === "Outro" && decision.observacao.trim().length < 3) {
          fail("Explique o motivo na observação (você escolheu “Outro”).");
          return;
        }
      }
      compra = {
        supplierId,
        numeroNota,
        itens,
        divergencia: above ? { acao: decision.acao, motivo: decision.motivo, observacao: decision.observacao } : undefined,
      };
    } else if (editing && hadCompra) {
      compra = null;
    }

    setFormError(null);
    setSaving(true);
    const payload: Record<string, unknown> = { ...form, dataPagamento: form.dataPagamento || null, ...(compra !== undefined ? { compra } : {}) };
    if (editing) {
      // Datas que ninguém mexeu não são reenviadas: assim abrir e salvar a conta não desloca a data.
      for (const key of ["dataCompetencia", "dataVencimento", "dataPagamento"] as const) {
        if (form[key] === initialDates.current[key]) delete payload[key];
      }
    }
    const result = editing
      ? await apiRequest(`/api/financeiro/pagar/${editing.id}`, "PATCH", payload)
      : await apiRequest("/api/financeiro/pagar", "POST", payload);
    setSaving(false);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setShowForm(false);
    setDirty(false);
    refresh();
  }

  async function markPaid(p: PayableDTO) {
    setRowError(null);
    const result = await apiRequest(`/api/financeiro/pagar/${p.id}`, "PATCH", {
      status: "PAGO",
      dataPagamento: spDateKey(),
    });
    if (!result.ok) {
      setRowError(result.error);
      return;
    }
    refresh();
  }

  async function duplicate(p: PayableDTO) {
    setRowError(null);
    const result = await apiRequest("/api/financeiro/pagar", "POST", {
        fornecedor: p.fornecedor,
        descricao: `${p.descricao} (cópia)`,
        categoriaId: p.categoriaId,
        centroCusto: p.centroCusto,
        valor: p.valor,
        dataCompetencia: storedDayKey(p.dataCompetencia),
        dataVencimento: storedDayKey(p.dataVencimento),
        bankAccountId: p.bankAccountId,
        formaPagamento: p.formaPagamento,
        status: "EM_ABERTO",
    });
    if (!result.ok) {
      setRowError(result.error);
      return;
    }
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    const result = await apiRequest(`/api/financeiro/pagar/${confirmDeleteId}`, "DELETE");
    if (!result.ok) {
      setRowError(result.error);
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(null);
    refresh();
  }

  function exportCsv() {
    const header = ["Número", "Fornecedor", "Descrição", "Categoria", "Empresa", "Valor", "Vencimento", "Status", "Itens detalhados (%)", "Situação do combinado"];
    const rows = filtered.map((p) => [
      p.number,
      p.fornecedor,
      p.descricao,
      p.categoria.name,
      p.empresa.name,
      p.valor,
      format(new Date(p.dataVencimento), "dd/MM/yyyy"),
      STATUS_LABEL[p.status],
      p.invoice ? detailPercent(p.invoice.totalCobrado, p.valor) : 0,
      combinadoLabel(p.invoice),
    ]);
    const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contas-a-pagar.csv";
    a.click();
  }

  async function submitRecurring() {
    if (savingRecurring) return;
    if (!recurringForm.categoriaId || !recurringForm.bankAccountId) {
      setRecurringError("Selecione categoria e conta bancária antes de salvar.");
      return;
    }
    setRecurringError(null);
    setSavingRecurring(true);
    try {
      const result = await apiRequest("/api/financeiro/recorrentes", "POST", {
        ...recurringForm,
        tipo: "PAGAR",
      });
      if (!result.ok) {
        setRecurringError(result.error);
        return;
      }
      setShowRecurring(false);
      refresh();
    } finally {
      setSavingRecurring(false);
    }
  }

  return (
    <>
    <SortableStatCards
      storageKey="financeiro-contas-pagar-kpi-order"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      cards={[
        { key: "detalhado", label: "Detalhado nas contas do mês", value: `${kpis.detailedPct}%`, icon: "ListChecks", color: "#1464F4", hint: "do valor lançado neste mês já tem itens" },
        {
          key: "acima",
          label: "Acima do combinado no mês",
          value: formatCurrency(kpis.aboveValue),
          icon: "TrendingUp",
          color: "#ef4444",
          hint:
            kpis.aboveCount > 0
              ? `em ${kpis.aboveCount} ${kpis.aboveCount === 1 ? "conta" : "contas"} · clique para ver`
              : "nenhuma conta acima do combinado neste mês",
          onClick: kpis.aboveCount > 0 ? () => setShowAboveModal(true) : undefined,
        },
        { key: "contestacao", label: "Em contestação", value: `${kpis.contestedCount} ${kpis.contestedCount === 1 ? "conta" : "contas"}`, icon: "MessageSquare", color: "#f59e0b", hint: `${formatCurrency(kpis.contestedValue)} cobrados a mais` },
        {
          key: "proximos-7",
          label: "A pagar no período selecionado",
          value: formatCurrency(kpis.dueInPeriod),
          icon: "CalendarClock",
          color: "#1464F4",
          hint: `contas em aberto, exclui pagas · ${vencimentoFiltroLabel}`,
        },
      ]}
    />
    <Section
      title="Contas a Pagar"
      action={
        <div className="flex items-center gap-2 flex-wrap">
          <input
            placeholder="Buscar fornecedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-nord-panel border border-nord-border rounded-lg px-3 py-1.5 text-xs text-white w-40"
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-sm">
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white">
            <Download size={13} /> Excel
          </button>
          {canCreate && (
            <>
              <button onClick={() => setShowRecurring(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white">
                <Repeat size={13} /> Conta recorrente
              </button>
              <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium">
                <Plus size={13} /> Nova conta
              </button>
            </>
          )}
        </div>
      }
    >
      {!canCreate && (
        <p className="mb-3 text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          {isGrupoNordMode
            ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para lançar ou editar contas."
            : "Seu perfil de permissão não permite lançar ou editar contas neste módulo."}
        </p>
      )}
      <FormError message={rowError} />
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-wide text-nord-gray mb-1.5">Vencimento</p>
        <PeriodFilterBar
          periodo={filterVencimento}
          onApply={applyVencimento}
          options={DUE_DATE_FILTER_OPTIONS}
          initialCustomFrom={customFrom}
          initialCustomTo={customTo}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label="Filtro rápido por itens">
        {(
          [
            ["", "Todas"],
            ["SEM_ITENS", "Sem itens"],
            ["ACIMA", "Acima do combinado"],
            ["CONTESTACAO", "Em contestação"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key || "todas"}
            type="button"
            aria-pressed={quickFilter === key}
            onClick={() => setQuickFilter(key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              quickFilter === key ? "border-nord-blue bg-nord-blue/20 text-white" : "border-nord-border text-nord-gray hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-nord-gray mb-3">
        Total filtrado (todos os status, inclusive pagas):{" "}
        <span className="text-white font-medium">{formatCurrency(totalFiltrado)}</span> ({filtered.length} lançamentos)
      </p>
      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Nº</th>
              <th className="py-2 pr-4">Fornecedor</th>
              <th className="py-2 pr-4">Categoria</th>
              <th className="py-2 pr-4">Empresa</th>
              <th className="py-2 pr-4">Valor</th>
              <th className="py-2 pr-4">Vencimento</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Itens</th>
              <th className="py-2 pr-4">Combinado</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2 pr-4 text-nord-gray">{p.number}</td>
                <td className="py-2 pr-4 text-white">{p.fornecedor}</td>
                <td className="py-2 pr-4 text-nord-gray">{p.categoria.name}</td>
                <td className="py-2 pr-4 text-nord-gray">{p.empresa.name}</td>
                <td className="py-2 pr-4 text-nord-gray">{formatCurrency(p.valor)}</td>
                <td className="py-2 pr-4 text-nord-gray">{format(new Date(p.dataVencimento), "dd/MM/yyyy")}</td>
                <td className="py-2 pr-4">
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {p.invoice ? (
                    <div className="min-w-[84px]">
                      <span className="text-xs text-white">{detailPercent(p.invoice.totalCobrado, p.valor)}%</span>
                      <div className="mt-1 h-1.5 rounded-full bg-nord-border overflow-hidden" aria-hidden="true">
                        <div
                          className={`h-full rounded-full ${detailPercent(p.invoice.totalCobrado, p.valor) >= 100 ? "bg-nord-blue" : "bg-nord-warning"}`}
                          style={{ width: `${detailPercent(p.invoice.totalCobrado, p.valor)}%` }}
                        />
                      </div>
                      {canCreate && detailPercent(p.invoice.totalCobrado, p.valor) < 100 && (
                        <button type="button" onClick={() => openEdit(p)} className="mt-0.5 text-[11px] text-nord-blue-light hover:underline">
                          Completar
                        </button>
                      )}
                    </div>
                  ) : p.status === "CANCELADO" ? (
                    <span className="text-xs text-nord-gray">—</span>
                  ) : canCreate ? (
                    <button type="button" onClick={() => openEdit(p)} className="text-xs text-nord-blue-light hover:underline">
                      Sem itens · Detalhar
                    </button>
                  ) : (
                    <span className="text-xs text-nord-gray">Sem itens</span>
                  )}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  <CombinadoCell invoice={p.invoice} />
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2 justify-end">
                    {p.codigoBarras && (
                      <button
                        onClick={() => copyCode(p.id, p.codigoBarras!)}
                        title="Copiar código de barras/Pix"
                        className="text-nord-gray hover:text-white"
                      >
                        {copiedCodigoId === p.id ? <Check size={14} className="text-nord-success" /> : <ScanBarcode size={14} />}
                      </button>
                    )}
                    <div className={`flex items-center gap-2 ${!canCreate ? "hidden" : ""}`}>
                      {p.status !== "PAGO" && (
                        <button onClick={() => markPaid(p)} title="Marcar como pago" className="text-nord-gray hover:text-nord-success">
                          <Check size={14} />
                        </button>
                      )}
                      <button onClick={() => duplicate(p)} title="Duplicar" className="text-nord-gray hover:text-white">
                        <Copy size={14} />
                      </button>
                      <button onClick={() => openEdit(p)} className="text-nord-gray hover:text-white">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDeleteId(p.id)} className="text-nord-gray hover:text-nord-danger">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-nord-gray text-sm">
                  Nenhuma conta encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={closeForm} title={editing ? "Editar conta a pagar" : "Nova conta a pagar"} widthClass="max-w-5xl">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Field label="Fornecedor">
              <input
                required
                list="fornecedor-sugestoes"
                placeholder="Digite ou escolha um fornecedor já cadastrado"
                value={form.fornecedor}
                onChange={(e) => onFornecedorChange(e.target.value)}
                onBlur={() => loadHistory(form.fornecedor, supplierId)}
                className="input"
              />
              <datalist id="fornecedor-sugestoes">
                {fornecedorSugestoes.map((nome) => (
                  <option key={nome} value={nome} />
                ))}
              </datalist>
            </Field>
            <div className="mt-1 text-[11px] min-h-4">
              {supplierId ? (
                <span className="inline-flex items-center gap-1 text-nord-success">
                  <Check size={11} /> Cadastrado
                </span>
              ) : form.fornecedor.trim() ? (
                canCreateSupplier ? (
                  <button type="button" onClick={openNewSupplierPanel} className="text-nord-blue-light hover:underline">
                    Cadastrar “{form.fornecedor.trim()}” como novo fornecedor
                  </button>
                ) : (
                  <span className="text-nord-gray">Fornecedor não cadastrado (será salvo só como nome)</span>
                )
              ) : null}
            </div>
          </div>
          {newSupplierOpen && (
            <div className="col-span-2 rounded-lg border border-nord-border bg-nord-panel/40 p-3 space-y-2">
              <p className="text-xs text-white font-medium">Cadastrar novo fornecedor</p>
              <FormError message={newSupplierError} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Field label="Nome / razão social">
                  <input value={newSupplier.razaoSocial} onChange={(e) => setNewSupplier({ ...newSupplier, razaoSocial: e.target.value })} className="input" />
                </Field>
                <Field label="CNPJ (opcional)">
                  <input value={newSupplier.cnpj} onChange={(e) => setNewSupplier({ ...newSupplier, cnpj: e.target.value })} className="input" />
                </Field>
                <Field label="Telefone (opcional)">
                  <input value={newSupplier.telefone} onChange={(e) => setNewSupplier({ ...newSupplier, telefone: e.target.value })} className="input" />
                </Field>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={saveNewSupplier} disabled={savingSupplier} className="btn-primary !py-1.5 !text-xs">
                  {savingSupplier ? "Cadastrando..." : "Cadastrar fornecedor"}
                </button>
                <button type="button" onClick={() => setNewSupplierOpen(false)} className="btn-outline !py-1.5 !text-xs">
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <div className="col-span-2">
            <Field label="Código de barras do boleto ou Pix “copia e cola” (opcional)">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={codigoBarrasInputRef}
                  value={form.codigoBarras}
                  onChange={(e) => {
                    setForm({ ...form, codigoBarras: e.target.value });
                    setCodigoBarrasNote(null);
                    if (codigoBarrasDuplicate) setCodigoBarrasDuplicate(null);
                  }}
                  onBlur={() => applyCodigoBarras(form.codigoBarras)}
                  onKeyDown={(e) => {
                    // O leitor físico de código de barras "digita" os caracteres e aperta Enter
                    // sozinho ao terminar — processa na hora, sem depender do campo perder o foco.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCodigoBarras(e.currentTarget.value);
                    }
                  }}
                  placeholder="Bipe aqui com o leitor, cole o Pix ou digite a linha digitável do boleto"
                  className="input flex-1 min-w-[220px]"
                />
                {form.codigoBarras.trim() && (
                  <button
                    type="button"
                    onClick={() => copyCode("__form__", form.codigoBarras.trim())}
                    title="Copiar código"
                    className="p-2 rounded-lg border border-nord-border text-nord-gray hover:text-white"
                  >
                    {copiedCodigoId === "__form__" ? <Check size={13} className="text-nord-success" /> : <Copy size={13} />}
                  </button>
                )}
              </div>
            </Field>
            {checkingCodigo && <p className="mt-1 text-[11px] text-nord-gray">Checando duplicidade...</p>}
            {codigoBarrasNote && !codigoBarrasDuplicate && <p className="mt-1 text-[11px] text-nord-warning">{codigoBarrasNote}</p>}
            {codigoBarrasDuplicate && (
              <div className="mt-2 flex items-start gap-2 p-3 rounded-lg bg-nord-danger/10 border border-nord-danger/30">
                <AlertTriangle size={14} className="text-nord-danger mt-0.5 shrink-0" />
                <p className="text-xs text-nord-danger">
                  {codigoBarrasDuplicate.visible ? (
                    <>
                      Este código já está cadastrado: <strong>{codigoBarrasDuplicate.number}</strong> —{" "}
                      {codigoBarrasDuplicate.fornecedor} — {formatCurrency(codigoBarrasDuplicate.valor)} — vencimento{" "}
                      {format(new Date(codigoBarrasDuplicate.dataVencimento), "dd/MM/yyyy")} (loja {codigoBarrasDuplicate.empresa}).
                      Não é possível lançar o mesmo boleto duas vezes.
                    </>
                  ) : (
                    "Este código já está cadastrado em outra loja. Não é possível lançar o mesmo boleto duas vezes."
                  )}
                </p>
              </div>
            )}
          </div>
          <Field label="Descrição">
            <input required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="input" />
          </Field>
          <Field label="Categoria Financeira (vínculo DRE obrigatório)">
            <select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })} className="input">
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Centro de custo">
            <input value={form.centroCusto} onChange={(e) => setForm({ ...form, centroCusto: e.target.value })} className="input" />
          </Field>
          <Field label="Valor (R$)">
            <input required type="number" min="0.01" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="input" />
          </Field>
          <Field label="Data de Competência">
            <input type="date" value={form.dataCompetencia} onChange={(e) => setForm({ ...form, dataCompetencia: e.target.value })} className="input" />
          </Field>
          <Field label="Data de Vencimento">
            <input type="date" value={form.dataVencimento} onChange={(e) => setForm({ ...form, dataVencimento: e.target.value })} className="input" />
          </Field>
          <Field label="Data de Pagamento (quando foi paga)">
            <input
              type="date"
              value={form.dataPagamento}
              onChange={(e) => {
                setAutoPagamento(false);
                setForm({ ...form, dataPagamento: e.target.value });
              }}
              className="input"
            />
          </Field>
          <Field label="Conta Bancária">
            <select value={form.bankAccountId} onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })} className="input">
              <option value="">—</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Forma de Pagamento">
            <select value={form.formaPagamento} onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })} className="input">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => {
                const status = e.target.value;
                if (status === "PAGO" && !form.dataPagamento) {
                  // Marcou como pago e ainda não informou o dia do pagamento: sugere hoje (dá para trocar).
                  setForm({ ...form, status, dataPagamento: spDateKey() });
                  setAutoPagamento(true);
                } else if (autoPagamento && status !== "PAGO" && status !== "PARCIALMENTE_PAGO") {
                  // Voltou para “em aberto”: a data sugerida automaticamente não fica gravada.
                  setForm({ ...form, status, dataPagamento: "" });
                  setAutoPagamento(false);
                } else {
                  setForm({ ...form, status });
                }
              }}
              className="input"
            >
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="parcelado"
              checked={form.parcelado}
              onChange={(e) => setForm({ ...form, parcelado: e.target.checked })}
              className="accent-nord-blue"
            />
            <label htmlFor="parcelado" className="text-xs text-nord-gray">
              Parcelado
            </label>
          </div>
          {form.parcelado && (
            <>
              <Field label="Qtd. parcelas">
                <input type="number" value={form.quantidadeParcelas} onChange={(e) => setForm({ ...form, quantidadeParcelas: e.target.value })} className="input" />
              </Field>
              <Field label="Parcela atual">
                <input type="number" value={form.parcelaAtual} onChange={(e) => setForm({ ...form, parcelaAtual: e.target.value })} className="input" />
              </Field>
            </>
          )}
          <CompraItensEditor
            items={drafts}
            onItemsChange={changeDrafts}
            ingredients={ingredients}
            categorias={categorias}
            categoriaIdBoleto={form.categoriaId}
            hints={hints}
            lastPurchase={lastPurchase}
            loadingHistory={loadingHistory}
            valorBoleto={Number(form.valor) > 0 ? Number(form.valor) : 0}
            onUseTotal={(total) => setForm((f) => ({ ...f, valor: String(total) }))}
            decision={decision}
            onDecisionChange={changeDecision}
            hadCompra={hadCompra}
            numeroNota={numeroNota}
            onNumeroNotaChange={(v) => {
              setNumeroNota(v);
              setDirty(true);
            }}
            loadingItems={loadingCompra}
            loadFailed={compraLoadFailed}
            onRetryLoad={() => editing && loadCompraOf(editing)}
          />
          {repriceNote && <p className="col-span-2 text-xs text-nord-warning">{repriceNote}</p>}
          <div className="col-span-2">
            <Field label="Observações">
              <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="input min-h-14" />
            </Field>
          </div>
        </div>
        <div ref={errorRef} className="mt-4">
          <FormError message={formError} />
        </div>
        <button
          onClick={submit}
          disabled={saving || loadingCompra || compraLoadFailed || checkingCodigo || !!codigoBarrasDuplicate}
          className="w-full mt-2 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {saving ? "Salvando..." : drafts.length > 0 ? "Salvar com os itens" : "Salvar"}
        </button>
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        title="Descartar o que foi digitado?"
        message="O que você digitou nesta conta ainda não foi salvo. Se fechar agora, tudo se perde."
        onConfirm={() => {
          setConfirmDiscard(false);
          setShowForm(false);
          setDirty(false);
        }}
        onCancel={() => setConfirmDiscard(false)}
        confirmLabel="Descartar"
        danger
      />

      <Modal open={showRecurring} onClose={() => setShowRecurring(false)} title="Nova conta recorrente" widthClass="max-w-lg">
        <FormError message={recurringError} />
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Descrição (ex: Aluguel, Internet, Energia, Sistema, Salários...)">
              <input value={recurringForm.descricao} onChange={(e) => setRecurringForm({ ...recurringForm, descricao: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Fornecedor">
            <input
              list="fornecedor-recorrente-sugestoes"
              placeholder="Digite ou escolha um fornecedor já cadastrado"
              value={recurringForm.fornecedorCliente}
              onChange={(e) => setRecurringForm({ ...recurringForm, fornecedorCliente: e.target.value })}
              className="input"
            />
            <datalist id="fornecedor-recorrente-sugestoes">
              {fornecedorSugestoes.map((nome) => (
                <option key={nome} value={nome} />
              ))}
            </datalist>
          </Field>
          <Field label="Categoria (DRE)">
            <select value={recurringForm.categoriaId} onChange={(e) => setRecurringForm({ ...recurringForm, categoriaId: e.target.value })} className="input">
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Valor (R$)">
            <input type="number" value={recurringForm.valor} onChange={(e) => setRecurringForm({ ...recurringForm, valor: e.target.value })} className="input" />
          </Field>
          <Field label="Dia do vencimento">
            <input type="number" min={1} max={28} value={recurringForm.diaVencimento} onChange={(e) => setRecurringForm({ ...recurringForm, diaVencimento: e.target.value })} className="input" />
          </Field>
          <Field label="Conta Bancária">
            <select value={recurringForm.bankAccountId} onChange={(e) => setRecurringForm({ ...recurringForm, bankAccountId: e.target.value })} className="input">
              {contas.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Data de início">
            <input type="date" value={recurringForm.dataInicio} onChange={(e) => setRecurringForm({ ...recurringForm, dataInicio: e.target.value })} className="input" />
          </Field>
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="infinita"
              checked={recurringForm.infinita}
              onChange={(e) => setRecurringForm({ ...recurringForm, infinita: e.target.checked })}
              className="accent-nord-blue"
            />
            <label htmlFor="infinita" className="text-xs text-nord-gray">
              Recorrência infinita (gera automaticamente os próximos 24 meses)
            </label>
          </div>
          {!recurringForm.infinita && (
            <Field label="Quantidade de meses">
              <input type="number" value={recurringForm.quantidadeMeses} onChange={(e) => setRecurringForm({ ...recurringForm, quantidadeMeses: e.target.value })} className="input" />
            </Field>
          )}
        </div>
        <button
          onClick={submitRecurring}
          disabled={savingRecurring}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {savingRecurring ? "Criando..." : "Criar lançamentos recorrentes"}
        </button>
      </Modal>

      <Modal open={showAboveModal} onClose={() => setShowAboveModal(false)} title="Acima do combinado no mês" widthClass="max-w-2xl">
        <p className="text-xs text-nord-gray mb-3">
          Boletos com itens cobrados acima do preço combinado, lançados em {kpis.monthLabel} (data de competência).
        </p>
        {kpis.aboveList.length === 0 ? (
          <p className="py-6 text-center text-sm text-nord-gray">Nenhum boleto acima do combinado neste mês.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto nord-scrollbar">
            {kpis.aboveList.map(({ payable: p, diff }) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-nord-border p-3">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">
                    {p.fornecedor} <span className="text-nord-gray">· Nº {p.number}</span>
                  </p>
                  <p className="text-xs text-nord-gray truncate">{p.descricao}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-nord-danger">+{formatCurrency(diff)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAboveModal(false);
                      openEdit(p);
                    }}
                    className="text-[11px] text-nord-blue-light hover:underline"
                  >
                    Abrir boleto
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir conta a pagar"
        message="Tem certeza? Se estava paga, o saldo da conta bancária será revertido."
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />

    </Section>
    </>
  );
}

/** Texto curto da situação do combinado (para a exportação). */
function combinadoLabel(invoice: InvoiceSummary | null): string {
  if (!invoice) return "Sem itens";
  if (invoice.totalCombinado <= 0 && invoice.totalComparado <= 0) return "Sem preço combinado";
  if (invoice.divergenciaStatus === "EM_CONTESTACAO") return "Em contestação";
  if (invoice.divergenciaStatus === "ACEITA") return `Aceito${invoice.divergenciaMotivo ? ` (${invoice.divergenciaMotivo})` : ""}`;
  const diff = round2(invoice.totalComparado - invoice.totalCombinado);
  return diff < -0.05 ? "Abaixo do combinado" : "Dentro do combinado";
}

/** Situação da compra contra o combinado, para a coluna “Combinado” da lista. */
function CombinadoCell({ invoice }: { invoice: InvoiceSummary | null }) {
  if (!invoice) return <span className="text-xs text-nord-gray">—</span>;
  if (invoice.totalCombinado <= 0 && invoice.totalComparado <= 0) return <Badge tone="default">Sem preço combinado</Badge>;
  const diff = round2(invoice.totalComparado - invoice.totalCombinado);
  const pct = invoice.totalCombinado > 0 ? (diff / invoice.totalCombinado) * 100 : null;
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
  const detail = `${sign}${formatCurrency(Math.abs(diff))}${pct !== null && Math.abs(diff) > 0.05 ? ` (${diff > 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")}%)` : ""}`;
  if (invoice.divergenciaStatus === "EM_CONTESTACAO") {
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge tone="warning">Em contestação</Badge>
        <span className="text-[11px] text-nord-danger">{detail}</span>
      </div>
    );
  }
  if (invoice.divergenciaStatus === "ACEITA") {
    return (
      <div className="flex flex-col items-start gap-1" title={invoice.divergenciaMotivo ? `Aceito: ${invoice.divergenciaMotivo}` : "Diferença aceita"}>
        <Badge tone="info">Aceito{invoice.divergenciaMotivo ? ` · ${invoice.divergenciaMotivo}` : ""}</Badge>
        <span className="text-[11px] text-nord-danger">{detail}</span>
      </div>
    );
  }
  if (diff < -0.05) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge tone="success">Abaixo do combinado</Badge>
        <span className="text-[11px] text-nord-gray">{detail}</span>
      </div>
    );
  }
  return <Badge tone="success">Dentro do combinado</Badge>;
}

/** "AAAA-MM-DD" (chave de dia dos campos de data) -> "DD/MM/AAAA" para exibição. */
function formatDateKeyBR(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

/** Maiusculiza só a primeira letra (ex.: "outubro de 2026" -> "Outubro de 2026"). */
function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-nord-gray mb-1">{label}</span>
      {children}
    </label>
  );
}
