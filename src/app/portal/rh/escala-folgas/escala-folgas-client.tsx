"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, DoorClosed, Pencil, Plus, Trash2 } from "lucide-react";
import { Section, ColorBadge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { MonthCalendar } from "@/components/ui/month-calendar";
import { ColorPicker, COLOR_CHOICES } from "@/components/ui/icon-picker";

/**
 * Mesmo formato devolvido por `GET /api/rh/escala-folgas/calendario` (ver `getCalendarioDias` e os
 * tipos `CalendarioDia`/`CalendarioIndisponivel`/`CalendarioDayOffType` em
 * `@/lib/escala-folgas-server`) — tipado de novo aqui, sem importar daquele arquivo, porque este é
 * um componente client e aquele é um módulo server-only (faz leitura de banco via Prisma).
 */
type DayOffTypeDTO = { id: string; key: string; nome: string; cor: string; kind: string };
type IndisponivelDTO = {
  employeeId: string;
  employeeName: string;
  setor: string;
  cargo: string;
  photoUrl: string | null;
  empresaId: string;
  fonte: "DAY_OFF" | "VACATION" | "ABSENCE";
  sourceId: string;
  dayOffType: DayOffTypeDTO;
  observacao: string | null;
};
type CalendarioDiaDTO = {
  date: string;
  weekday: number;
  lojasFechadas: { empresaId: string; empresaName: string }[];
  indisponiveis: IndisponivelDTO[];
};

/**
 * Catálogo de tipos de folga (`GET /api/rh/escala-folgas/day-off-types`) — mesmo formato de
 * `DayOffTypeDTO` acima, mais `ativo` (o calendário não precisa disso, só o formulário desta fase,
 * pra continuar mostrando o nome de um tipo já desativado numa folga antiga em vez de escondê-lo).
 */
type DayOffTypeCatalogItem = DayOffTypeDTO & { ativo: boolean };

/** Colaborador ATIVO elegível pro select de "Colaborador" do formulário — já vem filtrado pelo
 *  servidor (`page.tsx`): só ATIVOs, e só do próprio setor quando `isSupervisor` (Líder). */
type EmployeeOptionDTO = { id: string; name: string; setor: string; cargo: string };

/**
 * Mesmo formato de `CoverageResult` (@/lib/escala-folgas) — tipado de novo aqui pelo mesmo motivo
 * do comentário no topo deste arquivo: client component não importa módulo nenhum que este projeto
 * trata como "camada de servidor", mesmo quando o módulo em si não faz I/O (mantém os dois lados
 * desacoplados de propósito).
 */
type CoverageResult = { quantidadeMinima: number; escalados: number; deficit: number; insuficiente: boolean };

/** Valor sentinela da opção "+ Cadastrar novo tipo..." no fim do `<select>` de "Tipo de folga" —
 *  nunca colide com um id real de `DayOffType` (que são sempre `cuid()`). */
const NEW_DAY_OFF_TYPE_OPTION = "__new__";

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAY_PLURAL = [
  "domingos",
  "segundas-feiras",
  "terças-feiras",
  "quartas-feiras",
  "quintas-feiras",
  "sextas-feiras",
  "sábados",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * "YYYY-MM-DD" a partir de um `Date` local (ano/mês/dia do calendário do navegador) — nunca passa
 * por `new Date("YYYY-MM-DD")` nem por `toISOString()` (conversões UTC), evitando a mesma família
 * de bug de fuso horário já corrigida 3x no backend desta feature (ver comentários em
 * `@/lib/escala-folgas`). Os `Date` usados nesta tela vêm sempre do `MonthCalendar` (que os
 * constrói com `new Date(ano, mes, dia)`, local) ou de `new Date()` puro — nunca de um parse de
 * string —, então extrair ano/mês/dia de volta com os getters locais é sempre seguro aqui.
 */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Primeiro/último dia (chave "YYYY-MM-DD") do mês de `cursor` — só ano/mês de `cursor` importam. */
function monthRange(cursor: Date): { from: string; to: string } {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  return {
    from: localDateKey(new Date(year, month, 1)),
    // Dia 0 do mês seguinte = último dia deste mês (aritmética de calendário local, sem UTC).
    to: localDateKey(new Date(year, month + 1, 0)),
  };
}

function capitalize(s: string) {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Mensagem do `ConfirmDialog` de cobertura insuficiente (núcleo da Fase 2b) — mesmos números que
 *  a API devolveu em `coverage`, nunca recalculados aqui (só ela conhece o total de ativos e quem
 *  mais já está indisponível nesse dia). */
function formatCoverageMessage(c: CoverageResult): string {
  return `Só ficaria${c.escalados === 1 ? "" : "m"} ${c.escalados} colaborador(es) escalado(s) nesse setor nesse dia (mínimo configurado: ${c.quantidadeMinima}) — faltam ${c.deficit}. Confirma mesmo assim?`;
}

/** "YYYY-MM-DD" -> `Date` LOCAL (meio-dia irrelevante, só ano/mês/dia importam aqui) — usado só
 *  pra formatar o título do modal por extenso. Nunca `new Date("YYYY-MM-DD")` (interpretado como
 *  UTC, pode voltar um dia em fusos negativos como o do Brasil); a construção numérica é sempre
 *  local e sem ambiguidade. */
function dateFromKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function PersonAvatar({ person, size = 22 }: { person: IndisponivelDTO; size?: number }) {
  const color = person.dayOffType.cor;
  const title = `${person.employeeName} · ${person.dayOffType.nome}`;
  if (person.photoUrl) {
    return (
      <Image
        src={person.photoUrl}
        alt={person.employeeName}
        title={title}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: `2px solid ${color}` }}
      />
    );
  }
  return (
    <div
      title={title}
      className="rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size / 2.3),
        backgroundColor: `${color}26`,
        color,
        border: `2px solid ${color}`,
      }}
    >
      {initialsOf(person.employeeName)}
    </div>
  );
}

/** Até `max` avatares sobrepostos + "+N" pro resto — resumo visual do dia (item 1 do pedido). */
function AvatarStack({ people, max = 3, size = 20 }: { people: IndisponivelDTO[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <PersonAvatar key={`${p.fonte}-${p.sourceId}`} person={p} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="rounded-full bg-nord-border text-nord-gray font-semibold flex items-center justify-center shrink-0"
          style={{ width: size, height: size, fontSize: Math.max(8, size / 2.5), border: "2px solid var(--nord-card)" }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

/**
 * Cabeçalho de navegação de mês só pra visão mobile (lista) — a visão desktop (grade) já ganha o
 * dela de graça do `MonthCalendar` compartilhado. Mesmos botões/rótulo, sem duplicar estado (recebe
 * `cursor`/`onCursorChange` do componente pai).
 */
function MonthNavControls({ cursor, onCursorChange }: { cursor: Date; onCursorChange: (d: Date) => void }) {
  const label = capitalize(format(cursor, "MMMM 'de' yyyy", { locale: ptBR }));
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="text-white text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="btn-outline p-1.5"
          onClick={() => onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          aria-label="Mês anterior"
        >
          <ChevronLeft size={14} />
        </button>
        <button type="button" className="btn-outline text-xs px-2.5 py-1.5" onClick={() => onCursorChange(new Date())}>
          Hoje
        </button>
        <button
          type="button"
          className="btn-outline p-1.5"
          onClick={() => onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          aria-label="Próximo mês"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function EscalaFolgasClient({
  isSupervisor,
  ownSetor,
  setores,
  isGrupoNordMode,
  canCreate,
  canEdit,
  canDelete,
  canManageDayOffTypes,
  employees,
}: {
  /** Líder — a API já restringe o resultado ao próprio setor dele, então o filtro fica fixo. */
  isSupervisor: boolean;
  ownSetor: string | null;
  /** Catálogo completo de setores (vazio quando `isSupervisor`, que não usa o filtro). */
  setores: string[];
  isGrupoNordMode: boolean;
  /** Só true quando a permissão `rh:canCreate` permite E uma loja específica está selecionada — o
   *  `POST` exige loja única (não dá pra saber em qual loja gravar no modo Grupo Nord consolidado). */
  canCreate: boolean;
  /** Editar/cancelar uma folga já existente não depende do modo de visualização (a folga já
   *  pertence a uma loja definida) — só da permissão em si, mesmo padrão já usado em Marketing
   *  (Tráfego Pago/Ideias/Parcerias/Tarefas). */
  canEdit: boolean;
  canDelete: boolean;
  /** Cadastrar um TIPO de folga (catálogo global, sem loja) não tem a ambiguidade de "em qual loja
   *  gravar" que criar uma folga em si tem — por isso é só a permissão crua `rh:canCreate`, sem
   *  combinar com o modo de visualização como `canCreate` acima faz. Controla só a visibilidade da
   *  opção "+ Cadastrar novo tipo..." no `<select>` de "Tipo de folga", tanto ao criar quanto ao
   *  editar uma folga. */
  canManageDayOffTypes: boolean;
  /** Colaboradores ATIVOS pro select de "Colaborador" do formulário — vazio quando `canCreate` é
   *  falso (o servidor só busca quando o formulário pode de fato ser usado). */
  employees: EmployeeOptionDTO[];
}) {
  // Líder sem ficha de colaborador vinculada (setor desconhecido): a API sempre devolveria vazio
  // pra esse caso (ver `resolveOwnSetor`), então nem vale a pena buscar — a tela mostra a mensagem
  // dedicada mais abaixo em vez do calendário. `isSupervisor`/`ownSetor` vêm do servidor e não
  // mudam durante a vida do componente, então dá pra resolver isso já no estado inicial (evita
  // precisar chamar setState de dentro do efeito só pra esse caso).
  const skipFetch = isSupervisor && !ownSetor;
  const [cursor, setCursor] = useState(() => new Date());
  const [setorFilter, setSetorFilter] = useState("");
  const [dias, setDias] = useState<CalendarioDiaDTO[] | null>(() => (skipFetch ? [] : null));
  const [loading, setLoading] = useState(() => !skipFetch);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Dia selecionado: alterna entre a LISTA de indisponíveis (padrão) e o FORMULÁRIO de
  // adicionar/editar folga (Fase 2b). `editingEntry` não-nulo = editando essa folga; nulo = criando
  // uma nova. Resetado sempre que `selectedDate` muda (novo dia aberto, ou modal fechado) no efeito
  // logo abaixo — nunca precisa ser resetado à mão em cada botão que fecha o formulário.
  const [dayModalView, setDayModalView] = useState<"list" | "form">("list");
  const [editingEntry, setEditingEntry] = useState<IndisponivelDTO | null>(null);
  const [entryForm, setEntryForm] = useState({ employeeId: "", dayOffTypeId: "", observacao: "" });
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [entryFormError, setEntryFormError] = useState<string | null>(null);

  // Mini-formulário inline "+ Cadastrar novo tipo..." (último item do select de "Tipo de folga") —
  // só aparece pra quem tem `canCreate` (mesma permissão `rh:canCreate` exigida pelo
  // `POST /api/rh/escala-folgas/day-off-types`; ver comentário no próprio `<select>` mais abaixo
  // sobre por que usar esse prop em vez de buscar a permissão de novo). `entryForm.dayOffTypeId` só
  // é alterado de verdade quando o cadastro é concluído com sucesso — enquanto este mini-formulário
  // está aberto, o valor antigo (se havia algum) fica só "escondido" por baixo (ver `value` do
  // `<select>`), e volta a aparecer selecionado se o usuário cancelar em vez de cadastrar.
  const [showNewTypeForm, setShowNewTypeForm] = useState(false);
  const [newTypeForm, setNewTypeForm] = useState({ nome: "", cor: COLOR_CHOICES[0] });
  const [newTypeSubmitting, setNewTypeSubmitting] = useState(false);
  const [newTypeError, setNewTypeError] = useState<string | null>(null);

  // Não-nulo = a API avisou que a cobertura mínima do setor ficaria insuficiente e ainda não
  // gravou nada (`{ saved: false, coverage }`) — mostra o `ConfirmDialog` de aviso com os números;
  // confirmando, reenvia a mesma requisição com `confirmarApesarDoAviso: true`.
  const [pendingCoverage, setPendingCoverage] = useState<CoverageResult | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<IndisponivelDTO | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Catálogo de tipos de folga pro select "Tipo de folga" — só busca quando o formulário pode
  // aparecer de verdade (criar OU editar), nunca pra quem só visualiza o calendário.
  const [dayOffTypes, setDayOffTypes] = useState<DayOffTypeCatalogItem[] | null>(null);

  useEffect(() => {
    if (!canCreate && !canEdit) return;
    let cancelled = false;
    fetch("/api/rh/escala-folgas/day-off-types")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setDayOffTypes(data.dayOffTypes ?? []);
      })
      .catch(() => {
        if (!cancelled) setDayOffTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canCreate, canEdit]);

  // Só linhas `kind: "FOLGA"` são cadastráveis por aqui (Férias/Afastamento são reservadas — ver
  // comentário em `GET /api/rh/escala-folgas/day-off-types`). Mantém tipos já DESATIVADOS na lista
  // (marcados "(inativo)" no rótulo) pra continuar mostrando corretamente o tipo de uma folga
  // antiga já gravada com ele, em vez de aparecer em branco no select ao editar.
  const folgaTypes = useMemo(() => (dayOffTypes ?? []).filter((t) => t.kind === "FOLGA"), [dayOffTypes]);

  /**
   * Abre o modal de um dia já resetando o estado do formulário (lista, nunca formulário; nenhuma
   * edição/exclusão pendente) — chamado nos dois lugares que abrem um dia (grade desktop e lista
   * mobile), nunca via `useEffect` reagindo a `selectedDate`: resetar direto no evento que causa a
   * mudança é o padrão recomendado pelo React pra isso (evita "setState em cascata" dentro de um
   * efeito, sinalizado pelo lint `react-hooks/set-state-in-effect`). Como fechar o modal não deixa
   * nada visível (o `Modal` nem renderiza com `selectedDate` nulo), não precisa resetar de novo ao
   * fechar — só ao abrir o próximo dia, o que já cobre inclusive reabrir o MESMO dia depois de
   * fechado (fechar sempre passa por `selectedDate: null` antes).
   */
  function openDay(dateKey: string) {
    setDayModalView("list");
    setEditingEntry(null);
    setEntryForm({ employeeId: "", dayOffTypeId: "", observacao: "" });
    setEntryFormError(null);
    setPendingCoverage(null);
    setDeletingEntry(null);
    setDeleteError(null);
    resetNewTypeForm();
    setSelectedDate(dateKey);
  }

  /** Fecha e limpa o mini-formulário "+ Cadastrar novo tipo..." — chamado sempre que o formulário de
   *  folga (criar ou editar) é aberto, fechado, ou reaberto, pra nunca vazar nome/cor digitados (ou
   *  um erro de uma tentativa anterior) de uma folga pra outra. */
  function resetNewTypeForm() {
    setShowNewTypeForm(false);
    setNewTypeForm({ nome: "", cor: COLOR_CHOICES[0] });
    setNewTypeError(null);
  }

  const loadCalendario = useCallback(async (): Promise<{ dias: CalendarioDiaDTO[]; error: string | null }> => {
    const { from, to } = monthRange(cursor);
    const params = new URLSearchParams({ from, to });
    if (!isSupervisor && setorFilter) params.set("setor", setorFilter);
    try {
      const res = await fetch(`/api/rh/escala-folgas/calendario?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { dias: [], error: data?.error ?? "Não foi possível carregar o calendário." };
      return { dias: data.dias ?? [], error: null };
    } catch {
      return { dias: [], error: "Falha de conexão ao carregar o calendário. Verifique sua internet e tente novamente." };
    }
  }, [cursor, setorFilter, isSupervisor]);

  useEffect(() => {
    if (skipFetch) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      const { dias: newDias, error: newError } = await loadCalendario();
      if (cancelled) return;
      setDias(newDias);
      setError(newError);
      setLoading(false);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [loadCalendario, skipFetch]);

  /** Reaproveitado depois de criar/editar/cancelar uma folga (item 5 do pedido: atualiza o
   *  calendário sem reload de página) — mesma busca do efeito acima, chamada sob demanda. */
  async function refreshCalendario() {
    setLoading(true);
    const { dias: newDias, error: newError } = await loadCalendario();
    setDias(newDias);
    setError(newError);
    setLoading(false);
  }

  const diasByDate = useMemo(() => {
    const map = new Map<string, CalendarioDiaDTO>();
    (dias ?? []).forEach((d) => map.set(d.date, d));
    return map;
  }, [dias]);

  // Legenda dinâmica: só os tipos que realmente aparecem nos dias carregados, com a cor/nome que a
  // própria API devolveu — nunca uma paleta fixa inventada aqui (o catálogo de tipos é editável).
  const legendTypes = useMemo(() => {
    const map = new Map<string, DayOffTypeDTO>();
    for (const d of dias ?? []) {
      for (const p of d.indisponiveis) {
        if (!map.has(p.dayOffType.key)) map.set(p.dayOffType.key, p.dayOffType);
      }
    }
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [dias]);

  const todosVazios = !!dias && dias.length > 0 && dias.every((d) => d.indisponiveis.length === 0 && d.lojasFechadas.length === 0);
  const selectedDia = selectedDate ? (diasByDate.get(selectedDate) ?? null) : null;
  const todayKey = localDateKey(new Date());

  const dayModalTitle = !selectedDia
    ? "Detalhes do dia"
    : dayModalView === "list"
      ? capitalize(format(dateFromKey(selectedDia.date), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR }))
      : editingEntry
        ? "Editar folga"
        : "Adicionar folga";

  function openCreateForm() {
    setEditingEntry(null);
    setEntryForm({ employeeId: "", dayOffTypeId: "", observacao: "" });
    setEntryFormError(null);
    setPendingCoverage(null);
    resetNewTypeForm();
    setDayModalView("form");
  }

  function openEditForm(p: IndisponivelDTO) {
    setEditingEntry(p);
    setEntryForm({ employeeId: p.employeeId, dayOffTypeId: p.dayOffType.id, observacao: p.observacao ?? "" });
    setEntryFormError(null);
    setPendingCoverage(null);
    resetNewTypeForm();
    setDayModalView("form");
  }

  function closeEntryForm() {
    setDayModalView("list");
    setEditingEntry(null);
    setEntryFormError(null);
    setPendingCoverage(null);
    resetNewTypeForm();
  }

  /**
   * Cria (`editingEntry` nulo) ou edita uma folga. `confirmarApesarDoAviso` só vai `true` quando
   * chamado de novo a partir do `ConfirmDialog` de cobertura insuficiente (ver `pendingCoverage`
   * abaixo) — a 1ª tentativa é sempre sem esse campo, deixando a API decidir se precisa avisar.
   * `employeeId`/`date` só entram no body ao CRIAR: o `PATCH` não aceita trocar o colaborador de
   * uma folga já existente (só `date?`/`dayOffTypeId?`/`observacao?`), e a data já é a do dia
   * clicado no calendário — por isso nenhum dos dois formulários (criar/editar) mostra um campo de
   * data separado, só o colaborador (fixo ao editar) e o tipo.
   */
  async function submitEntry(confirmarApesarDoAviso: boolean) {
    if (entrySubmitting || !selectedDate) return;
    setEntryFormError(null);
    if (!editingEntry && !entryForm.employeeId) {
      setEntryFormError("Selecione o colaborador.");
      return;
    }
    if (!entryForm.dayOffTypeId) {
      setEntryFormError("Selecione o tipo de folga.");
      return;
    }

    setEntrySubmitting(true);
    try {
      const body: Record<string, unknown> = {
        dayOffTypeId: entryForm.dayOffTypeId,
        observacao: entryForm.observacao.trim() || null,
      };
      if (!editingEntry) {
        body.employeeId = entryForm.employeeId;
        body.date = selectedDate;
      }
      if (confirmarApesarDoAviso) body.confirmarApesarDoAviso = true;

      const res = editingEntry
        ? await fetch(`/api/rh/escala-folgas/entries/${editingEntry.sourceId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/rh/escala-folgas/entries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPendingCoverage(null);
        setEntryFormError(data?.error ?? "Não foi possível salvar a folga.");
        return;
      }
      // `saved: false` (HTTP 200, não é erro): a API calculou a cobertura do setor e ela ficaria
      // insuficiente — nada foi gravado ainda. Mostra o aviso com os números reais e espera
      // confirmação explícita antes de reenviar com `confirmarApesarDoAviso: true`.
      if (data.saved === false && data.coverage) {
        setPendingCoverage(data.coverage);
        return;
      }
      setPendingCoverage(null);
      // Atualiza o calendário ANTES de voltar pra lista — nunca o contrário: fazer isso depois
      // deixaria a lista aparecer por um instante ainda com o dado antigo (sem a folga recém-
      // salva) até o fetch terminar, um "flash" desnecessário já que a folga foi confirmada salva.
      await refreshCalendario();
      closeEntryForm();
    } catch {
      setPendingCoverage(null);
      setEntryFormError("Falha de conexão ao salvar. Verifique sua internet e tente novamente.");
    } finally {
      setEntrySubmitting(false);
    }
  }

  /**
   * Cadastra o tipo de folga digitado no mini-formulário "+ Cadastrar novo tipo..." via
   * `POST /api/rh/escala-folgas/day-off-types` (sempre cria com `kind: "FOLGA"`, nunca
   * FERIAS/AFASTAMENTO — ver comentário na própria rota). Dá certo: entra na lista local
   * (`dayOffTypes`) sem recarregar a página e já fica selecionado no formulário de folga, pra quem
   * estava tentando adicionar uma folga poder seguir direto pra "Salvar" com o tipo novo já
   * escolhido. Erro 409 (nome duplicado) ou 403 (sem permissão) aparecem com a mensagem que a
   * própria API devolve, igual ao padrão de erro já usado no resto deste formulário.
   */
  async function submitNewType() {
    if (newTypeSubmitting) return;
    const nome = newTypeForm.nome.trim();
    if (!nome) {
      setNewTypeError("Informe o nome do novo tipo de folga.");
      return;
    }
    setNewTypeSubmitting(true);
    setNewTypeError(null);
    try {
      const res = await fetch("/api/rh/escala-folgas/day-off-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, cor: newTypeForm.cor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNewTypeError(data?.error ?? "Não foi possível cadastrar o tipo de folga.");
        return;
      }
      const created: DayOffTypeCatalogItem = { ...data.dayOffType, ativo: true };
      setDayOffTypes((prev) => [...(prev ?? []), created]);
      setEntryForm((prev) => ({ ...prev, dayOffTypeId: created.id }));
      resetNewTypeForm();
    } catch {
      setNewTypeError("Falha de conexão ao cadastrar. Verifique sua internet e tente novamente.");
    } finally {
      setNewTypeSubmitting(false);
    }
  }

  async function doDeleteEntry() {
    if (!deletingEntry || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/rh/escala-folgas/entries/${deletingEntry.sourceId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data?.error ?? "Não foi possível cancelar esta folga.");
        return;
      }
      // Mesmo motivo do `submitEntry`: atualiza antes de fechar o `ConfirmDialog`, pra lista por
      // baixo já reaparecer sem a folga cancelada, em vez de mostrá-la por um instante ainda ali.
      await refreshCalendario();
      setDeletingEntry(null);
      setDeleteError(null);
    } catch {
      setDeleteError("Falha de conexão ao cancelar. Verifique sua internet e tente novamente.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  if (isSupervisor && !ownSetor) {
    return (
      <div className="space-y-6">
        <Section title="Calendário">
          <p className="text-sm text-nord-gray text-center py-8">
            Seu usuário ainda não está vinculado a uma ficha de colaborador com setor definido, então não é possível
            saber quais folgas mostrar aqui. Peça a um administrador para vincular seu usuário a um colaborador em
            RH → Colaboradores.
          </p>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section
        title="Calendário"
        action={
          <div className="flex items-center gap-3">
            {loading && dias !== null && <span className="text-xs text-nord-gray animate-pulse">Atualizando...</span>}
            {isSupervisor ? (
              <span className="flex items-center gap-1.5 text-xs text-nord-gray">
                Setor <ColorBadge color="#1464F4">{ownSetor}</ColorBadge>
              </span>
            ) : (
              <select
                className="input-sm"
                value={setorFilter}
                onChange={(e) => setSetorFilter(e.target.value)}
                aria-label="Filtrar por setor"
              >
                <option value="">Todos os setores</option>
                {setores.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>
        )}

        {dias === null ? (
          <div className="animate-pulse space-y-1.5">
            <div className="h-5 bg-nord-border/40 rounded w-40 mb-3" />
            <div className="hidden md:grid grid-cols-7 gap-1.5">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-[92px] bg-nord-border/30 rounded-lg" />
              ))}
            </div>
            <div className="md:hidden space-y-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 bg-nord-border/30 rounded-lg" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {legendTypes.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mb-4 pb-4 border-b border-nord-border/60">
                <span className="text-xs text-nord-gray">Legenda:</span>
                {legendTypes.map((t) => (
                  <ColorBadge key={t.key} color={t.cor}>
                    {t.nome}
                  </ColorBadge>
                ))}
              </div>
            )}

            {todosVazios && (
              <p className="text-sm text-nord-gray text-center py-2 mb-3">
                Nenhuma folga, férias ou afastamento registrado neste mês.
              </p>
            )}

            {/* Desktop/tablet: grade mensal completa (componente compartilhado `MonthCalendar`). */}
            <div className="hidden md:block">
              <MonthCalendar
                cursor={cursor}
                onCursorChange={setCursor}
                renderDay={(day, { inMonth, isToday }) => {
                  const key = localDateKey(day);
                  const dia = diasByDate.get(key);
                  const hasData = !!dia && (dia.indisponiveis.length > 0 || dia.lojasFechadas.length > 0);
                  // Fase 2b: um dia sem nada registrado ainda precisa abrir (pra oferecer
                  // "Adicionar folga") sempre que dá pra criar — só fica de fato não-clicável
                  // quando não há nem dado pra mostrar nem ação possível (calendário só-leitura
                  // pra esse usuário, ou dia fora do mês carregado — `dia` indefinido).
                  const clickable = !!dia && (hasData || canCreate);
                  return (
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && openDay(key)}
                      className={`w-full min-h-[92px] rounded-lg border p-1.5 text-left flex flex-col ${
                        isToday ? "border-nord-blue bg-nord-blue/10" : "border-nord-border/60 bg-nord-panel/40"
                      } ${inMonth ? "" : "opacity-40"} ${clickable ? "hover:border-nord-blue/60 cursor-pointer" : "cursor-default"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-semibold ${isToday ? "text-nord-blue-light" : "text-nord-gray"}`}>
                          {day.getDate()}
                        </span>
                        {dia && dia.lojasFechadas.length > 0 && (
                          <span title={dia.lojasFechadas.map((l) => l.empresaName).join(", ") || "Loja fechada"}>
                            <DoorClosed size={11} className="text-nord-warning shrink-0" aria-label="Loja fechada" />
                          </span>
                        )}
                      </div>
                      {dia && dia.indisponiveis.length > 0 && (
                        <div className="mt-auto pt-1.5">
                          <AvatarStack people={dia.indisponiveis} />
                        </div>
                      )}
                    </button>
                  );
                }}
              />
            </div>

            {/* Mobile: lista de dias do mês — a grade de 7 colunas fica estreita demais pra mostrar
                com clareza quem está de folga numa tela de celular. */}
            <div className="md:hidden">
              <MonthNavControls cursor={cursor} onCursorChange={setCursor} />
              <div className="space-y-1.5">
                {(dias ?? []).map((dia) => {
                  const hasData = dia.indisponiveis.length > 0 || dia.lojasFechadas.length > 0;
                  // Mesmo racional do desktop acima: dia vazio ainda abre se dá pra criar folga.
                  const clickable = hasData || canCreate;
                  const isToday = dia.date === todayKey;
                  return (
                    <button
                      key={dia.date}
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && openDay(dia.date)}
                      className={`w-full flex items-center gap-3 rounded-lg border p-2.5 text-left ${
                        isToday ? "border-nord-blue bg-nord-blue/10" : "border-nord-border/60 bg-nord-panel/40"
                      } ${clickable ? "hover:border-nord-blue/60 cursor-pointer" : "cursor-default"}`}
                    >
                      <div className="w-11 shrink-0 text-center">
                        <p className={`text-[10px] uppercase ${isToday ? "text-nord-blue-light" : "text-nord-gray"}`}>
                          {WEEKDAY_SHORT[dia.weekday]}
                        </p>
                        <p className="text-lg font-semibold text-white leading-none">{Number(dia.date.slice(8, 10))}</p>
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        {!hasData ? (
                          <span className="text-xs text-nord-gray">Sem indisponibilidades</span>
                        ) : (
                          <>
                            {dia.indisponiveis.length > 0 && <AvatarStack people={dia.indisponiveis} size={22} />}
                            {dia.lojasFechadas.length > 0 && (
                              <span className="flex items-center gap-1 text-[11px] text-nord-warning">
                                <DoorClosed size={12} /> Loja fechada
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
                {(dias ?? []).length === 0 && <p className="text-sm text-nord-gray text-center py-6">Nenhum dado para este mês.</p>}
              </div>
            </div>
          </>
        )}
      </Section>

      <Modal open={!!selectedDate} onClose={() => setSelectedDate(null)} title={dayModalTitle}>
        {selectedDia && dayModalView === "list" && (
          <div className="space-y-4">
            {!canCreate && (
              <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
                {isGrupoNordMode
                  ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para cadastrar folgas."
                  : "Seu perfil de permissão não permite cadastrar folgas neste módulo."}
              </p>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={openCreateForm}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
              >
                <Plus size={13} /> Adicionar folga
              </button>
            )}

            {selectedDia.lojasFechadas.length > 0 && (
              <div className="rounded-lg border border-nord-warning/30 bg-nord-warning/10 p-3">
                <p className="text-xs font-medium text-nord-warning flex items-center gap-1.5">
                  <DoorClosed size={13} /> Loja fechada neste dia
                </p>
                <p className="text-sm text-white mt-1">
                  {isGrupoNordMode
                    ? `${selectedDia.lojasFechadas.map((l) => l.empresaName).join(", ")} não ${
                        selectedDia.lojasFechadas.length > 1 ? "abrem" : "abre"
                      } aos ${WEEKDAY_PLURAL[selectedDia.weekday]}.`
                    : `Não abre aos ${WEEKDAY_PLURAL[selectedDia.weekday]}.`}
                </p>
              </div>
            )}

            {selectedDia.indisponiveis.length === 0 ? (
              <p className="text-sm text-nord-gray text-center py-4">Ninguém indisponível neste dia.</p>
            ) : (
              <div className="space-y-2">
                {selectedDia.indisponiveis.map((p) => {
                  // Só `DayOffEntry` (fonte "DAY_OFF") é gerenciável por aqui — Férias/Afastamento
                  // são cadastrados pelas rotinas próprias (RH > Férias / Afastamentos) e só
                  // aparecem aqui pra leitura (ver comentário em `GET .../day-off-types`).
                  const manageable = p.fonte === "DAY_OFF";
                  return (
                    <div key={`${p.fonte}-${p.sourceId}`} className="flex items-start gap-3 p-2.5 rounded-lg border border-nord-border/60">
                      <PersonAvatar person={p} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm text-white font-medium truncate">{p.employeeName}</p>
                          <ColorBadge color={p.dayOffType.cor}>{p.dayOffType.nome}</ColorBadge>
                        </div>
                        <p className="text-xs text-nord-gray mt-0.5">
                          {p.cargo} · {p.setor}
                        </p>
                        {p.observacao && <p className="text-xs text-nord-gray italic mt-1">&ldquo;{p.observacao}&rdquo;</p>}
                      </div>
                      {manageable && (canEdit || canDelete) && (
                        <div className="flex items-center gap-2 shrink-0">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEditForm(p)}
                              className="text-nord-gray hover:text-white"
                              aria-label={`Editar folga de ${p.employeeName}`}
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeletingEntry(p);
                              }}
                              className="text-nord-gray hover:text-nord-danger"
                              aria-label={`Cancelar folga de ${p.employeeName}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {selectedDia && dayModalView === "form" && (
          <div className="space-y-3">
            <FormError message={entryFormError} />
            <p className="text-xs text-nord-gray">
              Data: <span className="text-white">{format(dateFromKey(selectedDia.date), "dd/MM/yyyy")}</span>
            </p>

            {editingEntry ? (
              <div>
                <span className="block text-xs text-nord-gray mb-1">Colaborador</span>
                <p className="text-sm text-white">
                  {editingEntry.employeeName}{" "}
                  <span className="text-nord-gray">
                    — {editingEntry.setor} · {editingEntry.cargo}
                  </span>
                </p>
              </div>
            ) : (
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Colaborador</span>
                <select
                  value={entryForm.employeeId}
                  onChange={(e) => setEntryForm({ ...entryForm, employeeId: e.target.value })}
                  className="input"
                >
                  <option value="">Selecione...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — {emp.setor} · {emp.cargo}
                    </option>
                  ))}
                </select>
                {employees.length === 0 && (
                  <span className="block text-xs text-nord-warning mt-1">
                    Nenhum colaborador ativo disponível para cadastro de folga.
                  </span>
                )}
              </label>
            )}

            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Tipo de folga</span>
              <select
                value={showNewTypeForm ? NEW_DAY_OFF_TYPE_OPTION : entryForm.dayOffTypeId}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === NEW_DAY_OFF_TYPE_OPTION) {
                    setNewTypeError(null);
                    setShowNewTypeForm(true);
                    return;
                  }
                  setShowNewTypeForm(false);
                  setEntryForm({ ...entryForm, dayOffTypeId: value });
                }}
                className="input"
              >
                <option value="">Selecione...</option>
                {folgaTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                    {!t.ativo ? " (inativo)" : ""}
                  </option>
                ))}
                {/* `canManageDayOffTypes` é a permissão crua `rh:canCreate`, sem combinar com o
                    modo de visualização (diferente de `canCreate`, que também exige loja única por
                    causa do `POST /api/rh/escala-folgas/entries`). Cadastrar um TIPO de folga é um
                    catálogo global, sem loja (ver `day-off-types/route.ts`) — por isso a opção
                    aparece tanto ao criar quanto ao editar uma folga, mesmo no modo Grupo Nord
                    consolidado, desde que a pessoa tenha a permissão. */}
                {canManageDayOffTypes && (
                  <>
                    <option disabled>──────────</option>
                    <option value={NEW_DAY_OFF_TYPE_OPTION}>+ Cadastrar novo tipo...</option>
                  </>
                )}
              </select>
            </label>

            {showNewTypeForm && (
              <div className="rounded-lg border border-nord-border bg-nord-panel/60 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-white font-medium">Novo tipo de folga</p>
                  <ColorBadge color={newTypeForm.cor}>{newTypeForm.nome.trim() || "Pré-visualização"}</ColorBadge>
                </div>
                <FormError message={newTypeError} />
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Nome</span>
                  <input
                    value={newTypeForm.nome}
                    onChange={(e) => setNewTypeForm({ ...newTypeForm, nome: e.target.value })}
                    className="input"
                    placeholder="Ex.: Day off aniversário"
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Cor</span>
                  <ColorPicker value={newTypeForm.cor} onChange={(cor) => setNewTypeForm({ ...newTypeForm, cor })} />
                </label>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewTypeForm(false);
                      setNewTypeError(null);
                    }}
                    className="btn-outline text-xs px-3 py-1.5 flex-1"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={submitNewType}
                    disabled={newTypeSubmitting}
                    className="flex-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg px-3 py-1.5"
                  >
                    {newTypeSubmitting ? "Cadastrando..." : "Cadastrar tipo"}
                  </button>
                </div>
              </div>
            )}

            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Observação (opcional)</span>
              <input
                value={entryForm.observacao}
                onChange={(e) => setEntryForm({ ...entryForm, observacao: e.target.value })}
                className="input"
              />
            </label>

            <div className="flex items-center gap-2 pt-1">
              <button type="button" onClick={closeEntryForm} className="btn-outline text-sm px-4 py-2.5 flex-1">
                Voltar
              </button>
              <button
                type="button"
                onClick={() => submitEntry(false)}
                disabled={entrySubmitting || showNewTypeForm}
                title={showNewTypeForm ? "Cadastre ou cancele o novo tipo de folga antes de salvar" : undefined}
                className="flex-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg py-2.5"
              >
                {entrySubmitting ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!pendingCoverage}
        title="Cobertura mínima do setor"
        message={pendingCoverage ? formatCoverageMessage(pendingCoverage) : ""}
        onConfirm={() => submitEntry(true)}
        onCancel={() => setPendingCoverage(null)}
        confirmLabel={entrySubmitting ? "Confirmando..." : "Confirmar mesmo assim"}
        danger
      />

      <ConfirmDialog
        open={!!deletingEntry}
        title="Cancelar folga"
        message={
          deleteError ??
          `Tem certeza que deseja cancelar a folga de ${deletingEntry?.employeeName ?? ""}? Essa ação não pode ser desfeita.`
        }
        onConfirm={doDeleteEntry}
        onCancel={() => {
          setDeletingEntry(null);
          setDeleteError(null);
        }}
        confirmLabel={deleteSubmitting ? "Cancelando..." : deleteError ? "Tentar novamente" : "Cancelar folga"}
        danger
      />
    </div>
  );
}
