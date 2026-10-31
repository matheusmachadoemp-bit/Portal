"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DoorClosed,
  ImageDown,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
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

/**
 * Resultado de UM colaborador no modo lote de `POST /api/rh/escala-folgas/entries` (mesmo formato
 * de `BatchEntryResult` daquela rota, sem o `dayOffEntry` em si — a tela só precisa saber se deu
 * certo, se falta confirmar cobertura, ou o motivo do erro; o calendário é sempre recarregado do
 * zero via `refreshCalendario()` depois, nunca montado a partir desse payload). Usado tanto pra 1
 * colaborador só (a tela sempre manda `employeeIds`, mesmo com 1 item, pra reaproveitar um único
 * caminho de código) quanto pra vários de uma vez.
 */
type BatchEntryResultDTO = {
  employeeId: string;
  employeeName: string | null;
} & (
  | { status: "created" }
  | { status: "coverage_pending"; coverage: CoverageResult }
  | { status: "error"; error: string }
);

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

/** Remove acentos ("Março" -> "Marco") — só usado pra montar o nome do arquivo PNG exportado
 *  (item "Exportar como imagem" abaixo), pra nunca depender do navegador/SO lidando bem com
 *  acento em nome de arquivo baixado. */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Mensagem do `ConfirmDialog` de cobertura insuficiente (núcleo da Fase 2b) — mesmos números que
 *  a API devolveu em `coverage`, nunca recalculados aqui (só ela conhece o total de ativos e quem
 *  mais já está indisponível nesse dia). */
function formatCoverageMessage(c: CoverageResult): string {
  return `Só ficaria${c.escalados === 1 ? "" : "m"} ${c.escalados} colaborador(es) escalado(s) nesse setor nesse dia (mínimo configurado: ${c.quantidadeMinima}) — faltam ${c.deficit}. Confirma mesmo assim?`;
}

/** Mesmo aviso de `formatCoverageMessage` acima, mas pro modo lote (Adicionar folga pra vários
 *  colaboradores de uma vez): cada um pode pertencer a um setor diferente e cada setor tem seu
 *  próprio número de cobertura, então lista um por um em vez de uma frase só. Só chamado com pelo
 *  menos 1 item (`status: "coverage_pending"`). */
function formatBatchCoverageMessage(pending: (BatchEntryResultDTO & { status: "coverage_pending" })[]) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-nord-gray">
        {pending.length === 1
          ? "A cobertura mínima do setor ficaria abaixo do configurado:"
          : `A cobertura mínima do setor ficaria abaixo do configurado para ${pending.length} colaborador(es):`}
      </p>
      <ul className="space-y-1 text-xs text-nord-gray list-disc ml-4">
        {pending.map((p) => (
          <li key={p.employeeId}>
            <span className="text-white">{p.employeeName ?? "Colaborador"}</span> — só ficaria
            {p.coverage.escalados === 1 ? "" : "m"} {p.coverage.escalados} escalado(s) (mínimo{" "}
            {p.coverage.quantidadeMinima}, faltam {p.coverage.deficit})
          </li>
        ))}
      </ul>
      <p className="text-sm text-nord-gray">Confirma mesmo assim?</p>
    </div>
  );
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

/** Primeiro nome — versão compacta de `employeeName` pra caber na célula estreita do calendário
 *  (grade desktop, ~1/7 da largura do card). Usado só como rótulo visual; o nome completo continua
 *  disponível no `title` (tooltip) e no modal de detalhe do dia. */
function firstNameOf(name: string) {
  return name.split(" ").filter(Boolean)[0] ?? name;
}

/** "Nome completo - Setor" — mesmo formato literal pedido pelo usuário (ex.: "Aline Souza - CQ"),
 *  usado tanto no tooltip do avatar quanto na lista compacta de pessoas por dia. Mantém o tipo de
 *  folga no final (info que já existia no tooltip antes deste ajuste), separado por "·". */
function nameAndSetor(person: IndisponivelDTO) {
  return `${person.employeeName} - ${person.setor}`;
}

function PersonAvatar({
  person,
  size = 22,
  eager = false,
}: {
  person: IndisponivelDTO;
  size?: number;
  /** `true` só na grade "fantasma" usada pra exportar a imagem (ver `ExportCalendarCard` mais
   *  abaixo): ela fica posicionada fora da tela (pra gerar sempre no layout desktop, mesmo com a
   *  pessoa no celular), e o carregamento "lazy" padrão do `next/image` só dispara quando o
   *  elemento entra na área visível — fora da tela, isso nunca aconteceria, e a foto sairia em
   *  branco na imagem gerada. */
  eager?: boolean;
}) {
  const color = person.dayOffType.cor;
  const title = `${nameAndSetor(person)} · ${person.dayOffType.nome}`;
  if (person.photoUrl) {
    return (
      <Image
        src={person.photoUrl}
        alt={person.employeeName}
        title={title}
        width={size}
        height={size}
        loading={eager ? "eager" : "lazy"}
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
function AvatarStack({
  people,
  max = 3,
  size = 20,
  eager = false,
}: {
  people: IndisponivelDTO[];
  max?: number;
  size?: number;
  eager?: boolean;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <PersonAvatar key={`${p.fonte}-${p.sourceId}`} person={p} size={size} eager={eager} />
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
 * Resumo de quem está de folga num dia, direto na célula do calendário (sem precisar abrir o
 * modal) — item central deste ajuste. Com até 2 pessoas (o caso mais comum) mostra o nome + setor
 * de cada uma, no formato pedido ("Aline Souza - CQ"); a partir de 3 pessoas não cabe mais texto
 * sem quebrar a célula, então volta pro empilhamento de avatares + "+N" (`AvatarStack`) de sempre.
 * `compact` encurta o nome pro primeiro nome só (grade desktop, célula bem estreita); a lista
 * mobile tem mais largura disponível e usa o nome completo.
 */
function DayPeopleSummary({
  people,
  compact = false,
  eager = false,
}: {
  people: IndisponivelDTO[];
  compact?: boolean;
  /** Repassado pra `PersonAvatar` — ver comentário lá. */
  eager?: boolean;
}) {
  if (people.length > 2) {
    return <AvatarStack people={people} size={compact ? 20 : 22} eager={eager} />;
  }
  // Desktop (`compact`): a célula é um bloco comum (não-flex), então `w-full` garante uma largura
  // conhecida pro `truncate` interno funcionar. Mobile: o pai é uma linha flex (ao lado do dia e do
  // badge "Loja fechada"), então `flex-1` divide o espaço disponível e `min-w-0` permite encolher
  // sem empurrar o resto da linha pra fora — sem isso, texto com `white-space: nowrap` (de
  // `truncate`) tenderia a reivindicar sua largura total mesmo truncando visualmente.
  return (
    <div className={`flex flex-col gap-0.5 min-w-0 ${compact ? "w-full" : "flex-1"}`}>
      {people.map((p) => (
        <div
          key={`${p.fonte}-${p.sourceId}`}
          className="flex items-center gap-1 min-w-0"
          title={`${nameAndSetor(p)} · ${p.dayOffType.nome}`}
        >
          <PersonAvatar person={p} size={compact ? 13 : 18} eager={eager} />
          <span className={`truncate flex-1 min-w-0 leading-tight text-white ${compact ? "text-[9px]" : "text-[11px]"}`}>
            {compact ? firstNameOf(p.employeeName) : p.employeeName} - {p.setor}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Classes do wrapper de uma célula do calendário (dia do mês) — compartilhada entre o `<button>`
 *  clicável de verdade (grade desktop) e o `<div>` estático da imagem exportada
 *  (`ExportCalendarCard`), pra nunca os dois saírem visualmente diferentes um do outro.
 *  `interactive` só controla o cursor/hover (a imagem exportada não tem nada clicável). */
function dayCellClassName(isToday: boolean, inMonth: boolean, interactive: boolean): string {
  return `w-full min-h-[92px] rounded-lg border p-1.5 text-left flex flex-col ${
    isToday ? "border-nord-blue bg-nord-blue/10" : "border-nord-border/60 bg-nord-panel/40"
  } ${inMonth ? "" : "opacity-40"} ${interactive ? "hover:border-nord-blue/60 cursor-pointer" : "cursor-default"}`;
}

/** Conteúdo de dentro de uma célula do calendário (número do dia, ícone de loja fechada, resumo
 *  de quem está de folga) — mesmo motivo de `dayCellClassName` acima: compartilhado entre a
 *  célula clicável de verdade e a célula estática da imagem exportada. */
function DayCellContent({
  day,
  dia,
  isToday,
  eager = false,
}: {
  day: Date;
  dia: CalendarioDiaDTO | undefined;
  isToday: boolean;
  eager?: boolean;
}) {
  return (
    <>
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
        <div className="mt-auto pt-1.5 w-full">
          <DayPeopleSummary people={dia.indisponiveis} compact eager={eager} />
        </div>
      )}
    </>
  );
}

/** Mesma matemática de grade (42 células, incluindo o rastro do mês anterior/seguinte) que
 *  `MonthCalendar` já faz internamente pra desenhar a grade de verdade — duplicada aqui (poucas
 *  linhas, estável) só pra montar a grade "fantasma" de exportação (`ExportCalendarCard`), que
 *  não usa o `MonthCalendar` em si (não queremos os botões Anterior/Hoje/Próximo numa imagem
 *  estática baixada). */
function buildMonthGridDays(cursor: Date): Date[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from(
    { length: 42 },
    (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
  );
}

/**
 * Grade do mês pronta pra virar imagem (botão "Exportar como imagem") — sempre fora da área
 * visível da tela (`position: fixed; left: -10000px`), nunca visível pra quem usa o Portal
 * normalmente. Fica sempre montada (quando já há dado carregado) em vez de só durante o clique
 * de exportar, pra não precisar esperar um ciclo de render extra antes de capturar.
 *
 * Decisão de design: gera SEMPRE no layout "desktop" (grade 7 colunas), mesmo quando quem clicou
 * está no celular — uma grade de calendário é o formato mais reconhecível pra compartilhar (ex.
 * no grupo do WhatsApp) do que uma lista vertical bem alta, e também é mais simples de manter (1
 * layout de exportação só, em vez de replicar a lógica pra lista mobile também).
 */
function ExportCalendarCard({
  innerRef,
  empresaLabel,
  cursor,
  diasByDate,
  legendTypes,
  todayKey,
}: {
  innerRef: RefObject<HTMLDivElement | null>;
  empresaLabel: string;
  cursor: Date;
  diasByDate: Map<string, CalendarioDiaDTO>;
  legendTypes: DayOffTypeDTO[];
  todayKey: string;
}) {
  const days = useMemo(() => buildMonthGridDays(cursor), [cursor]);
  const month = cursor.getMonth();
  const monthLabel = capitalize(format(cursor, "MMMM 'de' yyyy", { locale: ptBR }));

  return (
    <div style={{ position: "fixed", top: 0, left: -10000, pointerEvents: "none" }} aria-hidden="true">
      <div ref={innerRef} className="nord-card p-6" style={{ width: 1040 }}>
        <p className="text-white text-lg font-semibold">{empresaLabel}</p>
        <p className="text-nord-gray text-sm mt-0.5">Escala de Folgas — {monthLabel}</p>

        {legendTypes.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-4 mb-4 pb-4 border-b border-nord-border/60">
            <span className="text-xs text-nord-gray">Legenda:</span>
            {legendTypes.map((t) => (
              <ColorBadge key={t.key} color={t.cor}>
                {t.nome}
              </ColorBadge>
            ))}
          </div>
        )}

        <div className="grid grid-cols-7 gap-1 mb-1.5 mt-4">
          {WEEKDAY_SHORT.map((d, i) => (
            <span key={i} className="text-center text-[11px] font-medium text-nord-gray py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => {
            const key = localDateKey(day);
            const dia = diasByDate.get(key);
            const isToday = key === todayKey;
            const inMonth = day.getMonth() === month;
            return (
              <div key={key} className={dayCellClassName(isToday, inMonth, false)}>
                <DayCellContent day={day} dia={dia} isToday={isToday} eager />
              </div>
            );
          })}
        </div>
      </div>
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

/**
 * Lista de checkboxes pra escolher 1+ colaboradores no formulário "Adicionar folga" — substitui o
 * antigo `<select>` de colaborador único (editar continua com colaborador fixo, sem esta lista).
 * Lista "crua" (sem busca/paginação): o universo já vem filtrado pelo servidor (só ATIVOs da loja
 * ativa, e só do próprio setor quando Líder — ver `EmployeeOptionDTO`), então deve ser pequeno o
 * suficiente pra caber numa lista rolável comum.
 */
function EmployeeMultiSelect({
  employees,
  selected,
  onChange,
}: {
  employees: EmployeeOptionDTO[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const allIds = useMemo(() => employees.map((e) => e.id), [employees]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));

  function toggleOne(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="rounded-lg border border-nord-border bg-nord-panel/40 overflow-hidden">
      <label className="flex items-center gap-2 px-3 py-2 border-b border-nord-border/60 bg-nord-panel/60 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => onChange(allSelected ? [] : allIds)}
          className="accent-nord-blue"
        />
        <span className="text-xs text-nord-gray">
          {allSelected ? "Desmarcar todos" : "Selecionar todos"} ({employees.length})
        </span>
        {selected.length > 0 && (
          <span className="ml-auto text-xs text-nord-blue-light font-medium">{selected.length} selecionado(s)</span>
        )}
      </label>
      <div className="max-h-48 overflow-y-auto nord-scrollbar divide-y divide-nord-border/40">
        {employees.map((emp) => (
          <label
            key={emp.id}
            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 select-none"
          >
            <input
              type="checkbox"
              checked={selected.includes(emp.id)}
              onChange={() => toggleOne(emp.id)}
              className="accent-nord-blue shrink-0"
            />
            <span className="text-sm text-white truncate">{emp.name}</span>
            <span className="ml-auto text-xs text-nord-gray shrink-0 pl-2">
              {emp.setor} · {emp.cargo}
            </span>
          </label>
        ))}
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
  empresaLabel,
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
  /** Nome da loja ativa ("Nord Pizza & Burger") ou "Grupo Nord (consolidado)" no modo
   *  consolidado — só pra identificar a imagem exportada pelo botão "Exportar como imagem" (a
   *  pessoa que recebe a imagem fora do Portal, ex. no WhatsApp, não tem outro jeito de saber de
   *  qual loja é aquela escala). */
  empresaLabel: string;
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
  // `employeeIds` só é usado ao CRIAR (multi-seleção, item desta tarefa); ao editar o colaborador é
  // fixo (o da folga já existente, mostrado como texto), então fica sempre vazio nesse caso.
  const [entryForm, setEntryForm] = useState({ employeeIds: [] as string[], dayOffTypeId: "", observacao: "" });
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
  // confirmando, reenvia a mesma requisição com `confirmarApesarDoAviso: true`. Só usado ao EDITAR
  // (`PATCH`, 1 colaborador só, formato de resposta de sempre) — ao criar usa `pendingBatchCoverage`
  // abaixo, mesmo com 1 colaborador só (a tela sempre manda `employeeIds` nesse caso).
  const [pendingCoverage, setPendingCoverage] = useState<CoverageResult | null>(null);
  // Não-nulo = resultado do `POST` em modo lote (ver `BatchEntryResultDTO`) trazendo 1+ colaboradores
  // com `status: "coverage_pending"` — junto com os demais resultados já definitivos daquela mesma
  // chamada (`created`/`error`), que não podem ser perdidos ao resolver os pendentes. Confirmando,
  // reenvia só os `employeeId` ainda pendentes com `confirmarApesarDoAviso: true`; cancelando (só
  // quando há 2+ colaboradores no lote — ver `handleCancelBatchCoverage`), os pendentes entram no
  // resumo final como "não criado".
  const [pendingBatchCoverage, setPendingBatchCoverage] = useState<BatchEntryResultDTO[] | null>(null);
  // Resumo final do `POST` em modo lote — só aparece quando o lote tinha 2+ colaboradores (com 1 só,
  // a tela se comporta como antes: fecha o modal silenciosamente no sucesso, ou mostra o erro inline
  // no próprio formulário). Modal próprio, aberto depois que o modal "Adicionar folga" já fechou.
  const [batchResult, setBatchResult] = useState<{ createdCount: number; results: BatchEntryResultDTO[] } | null>(
    null
  );
  const [deletingEntry, setDeletingEntry] = useState<IndisponivelDTO | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Catálogo de tipos de folga pro select "Tipo de folga" — só busca quando o formulário pode
  // aparecer de verdade (criar OU editar), nunca pra quem só visualiza o calendário.
  const [dayOffTypes, setDayOffTypes] = useState<DayOffTypeCatalogItem[] | null>(null);

  // Botão "Exportar como imagem" — captura o conteúdo de `exportRef` (grade "fantasma" do mês
  // atual, sempre no layout desktop, ver `ExportCalendarCard` mais abaixo) com `html-to-image` e
  // baixa como PNG. `exporting` só evita cliques repetidos enquanto a captura roda (pode levar um
  // instante); `exportError` mostra uma mensagem amigável se a geração falhar, sem travar a tela.
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
    setEntryForm({ employeeIds: [], dayOffTypeId: "", observacao: "" });
    setEntryFormError(null);
    setPendingCoverage(null);
    setPendingBatchCoverage(null);
    setBatchResult(null);
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

  /**
   * Gera e baixa o PNG do calendário do mês visível (botão "Exportar como imagem", item deste
   * ajuste). Importa `html-to-image` sob demanda (`import()` dinâmico) — só quem realmente clica
   * em exportar paga o custo de baixar essa lib, o resto do carregamento da tela fica igual.
   *
   * Por que `html-to-image` e não `html2canvas` (mais conhecida): `html2canvas` reimplementa um
   * parser de CSS próprio que não entende `color-mix()`/`oklch()` — exatamente o que o Tailwind
   * v4 usa por baixo dos panos pra QUALQUER classe com opacidade (`bg-nord-blue/10`,
   * `border-nord-border/60` etc., usadas o tempo todo nesta tela), o que sairia errado/preto na
   * imagem. `html-to-image` serializa o DOM como SVG (`<foreignObject>`) e deixa o próprio
   * motor de renderização do navegador desenhar — não precisa entender a cor, só mostrar o que o
   * navegador já sabe renderizar.
   */
  async function handleExportImage() {
    if (exporting || !exportRef.current) return;
    setExporting(true);
    setExportError(null);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(exportRef.current, {
        pixelRatio: 2,
        backgroundColor: "#151a23",
        cacheBust: true,
      });
      const monthSlug = stripDiacritics(format(cursor, "MMMM-yyyy", { locale: ptBR })).toLowerCase();
      const link = document.createElement("a");
      link.download = `escala-de-folgas-${monthSlug}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("[escala-folgas] Falha ao exportar o calendário como imagem:", err);
      setExportError("Não foi possível gerar a imagem do calendário. Tente novamente em instantes.");
    } finally {
      setExporting(false);
    }
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
    setEntryForm({ employeeIds: [], dayOffTypeId: "", observacao: "" });
    setEntryFormError(null);
    setPendingCoverage(null);
    setPendingBatchCoverage(null);
    resetNewTypeForm();
    setDayModalView("form");
  }

  function openEditForm(p: IndisponivelDTO) {
    setEditingEntry(p);
    setEntryForm({ employeeIds: [], dayOffTypeId: p.dayOffType.id, observacao: p.observacao ?? "" });
    setEntryFormError(null);
    setPendingCoverage(null);
    setPendingBatchCoverage(null);
    resetNewTypeForm();
    setDayModalView("form");
  }

  function closeEntryForm() {
    setDayModalView("list");
    setEditingEntry(null);
    setEntryFormError(null);
    setPendingCoverage(null);
    setPendingBatchCoverage(null);
    resetNewTypeForm();
  }

  /**
   * Edita uma folga já existente (`PATCH`, 1 colaborador só — o `PATCH` não aceita trocar o
   * colaborador de uma folga já existente, só `date?`/`dayOffTypeId?`/`observacao?`). Mesmo formato
   * de resposta de sempre (`{ dayOffEntry, saved, coverage }` ou `{ saved: false, coverage }` ou
   * `{ error }`), sem relação com o modo lote do `POST` (que só existe pra CRIAR). `confirmarApesar
   * DoAviso` só vai `true` quando chamado de novo a partir do `ConfirmDialog` de cobertura
   * insuficiente (`pendingCoverage` abaixo) — a 1ª tentativa é sempre sem esse campo.
   */
  async function submitEditEntry(confirmarApesarDoAviso: boolean) {
    if (entrySubmitting || !selectedDate || !editingEntry) return;
    setEntryFormError(null);
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
      if (confirmarApesarDoAviso) body.confirmarApesarDoAviso = true;

      const res = await fetch(`/api/rh/escala-folgas/entries/${editingEntry.sourceId}`, {
        method: "PATCH",
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
   * Chama o `POST` em modo lote (ver `BatchEntryResultDTO`) pros `employeeIds` informados — sempre
   * esse formato ao CRIAR, mesmo com 1 colaborador só, pra ter um único caminho de código (o
   * próprio backend já aceita isso de propósito, ver comentário na rota). Devolve o array de
   * resultados em caso de sucesso HTTP (200 — o lote nunca falha tudo-ou-nada), ou `null` se a
   * própria requisição falhar por completo (erro de validação, permissão, ou conexão) — nesses
   * casos `entryFormError` já fica setado aqui, quem chamou só precisa checar o retorno.
   */
  async function submitCreateEntries(employeeIds: string[], confirmarApesarDoAviso: boolean) {
    if (!selectedDate || employeeIds.length === 0) return null;
    setEntrySubmitting(true);
    setEntryFormError(null);
    try {
      const body: Record<string, unknown> = {
        employeeIds,
        dayOffTypeId: entryForm.dayOffTypeId,
        date: selectedDate,
        observacao: entryForm.observacao.trim() || null,
      };
      if (confirmarApesarDoAviso) body.confirmarApesarDoAviso = true;

      const res = await fetch("/api/rh/escala-folgas/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEntryFormError(data?.error ?? "Não foi possível salvar a folga.");
        return null;
      }
      return (data.results ?? []) as BatchEntryResultDTO[];
    } catch {
      setEntryFormError("Falha de conexão ao salvar. Verifique sua internet e tente novamente.");
      return null;
    } finally {
      setEntrySubmitting(false);
    }
  }

  /**
   * Botão "Salvar" do formulário de CRIAR (nunca chamado ao editar — ver `submitEditEntry`).
   * Valida o formulário, dispara a 1ª tentativa do lote (sem confirmar cobertura ainda) e decide o
   * que fazer com o resultado em `finalizeCreateResults`.
   */
  async function handleSubmitCreate() {
    if (entrySubmitting) return;
    setEntryFormError(null);
    if (entryForm.employeeIds.length === 0) {
      setEntryFormError("Selecione ao menos um colaborador.");
      return;
    }
    if (!entryForm.dayOffTypeId) {
      setEntryFormError("Selecione o tipo de folga.");
      return;
    }
    const results = await submitCreateEntries(entryForm.employeeIds, false);
    if (!results) return; // entryFormError já setado por submitCreateEntries.
    await finalizeCreateResults(results);
  }

  /** Separa quem ainda precisa de confirmação de cobertura (`coverage_pending`) do resto — se
   *  houver algum, abre o aviso (`pendingBatchCoverage`) e espera confirmar/cancelar antes de
   *  decidir o desfecho final; sem nenhum pendente, já finaliza direto. */
  async function finalizeCreateResults(results: BatchEntryResultDTO[]) {
    const hasPending = results.some((r) => r.status === "coverage_pending");
    if (hasPending) {
      setPendingBatchCoverage(results);
      return;
    }
    await completeCreateResults(results);
  }

  /**
   * Desfecho final do lote de criação (sem nenhum `coverage_pending` em aberto) — sempre recarrega
   * o calendário primeiro (igual já fazia `submitEditEntry`/o `submitEntry` de antes). Com 1
   * colaborador só, mantém a experiência de sempre: sucesso fecha o formulário em silêncio, erro
   * mostra a mensagem inline no próprio formulário (sem modal de resumo). Com 2+, sempre mostra o
   * resumo em modal próprio (`batchResult`), com sucesso total ou parcial — igual ao padrão já usado
   * em "Excluir selecionados" de Estoque > Produtos.
   */
  async function completeCreateResults(results: BatchEntryResultDTO[]) {
    await refreshCalendario();
    if (results.length === 1) {
      const [r] = results;
      if (r.status === "created") {
        closeEntryForm();
      } else if (r.status === "error") {
        setEntryFormError(r.error);
      }
      return;
    }
    const createdCount = results.filter((r) => r.status === "created").length;
    setBatchResult({ createdCount, results });
    setSelectedDate(null);
  }

  /** Confirma o(s) aviso(s) de cobertura insuficiente do lote (`pendingBatchCoverage`) — reenvia só
   *  quem ainda está `coverage_pending`, com `confirmarApesarDoAviso: true`; os demais resultados
   *  daquele mesmo lote (já definitivos) são preservados e combinados no desfecho final. */
  async function handleConfirmBatchCoverage() {
    if (!pendingBatchCoverage || entrySubmitting) return;
    const pendingIds = pendingBatchCoverage
      .filter((r): r is BatchEntryResultDTO & { status: "coverage_pending" } => r.status === "coverage_pending")
      .map((r) => r.employeeId);
    const others = pendingBatchCoverage.filter((r) => r.status !== "coverage_pending");
    const confirmResults = await submitCreateEntries(pendingIds, true);
    if (!confirmResults) {
      // `entryFormError` já setado por `submitCreateEntries` — ainda assim atualiza o calendário
      // pra refletir quem já tinha sido criado na 1ª chamada do lote, antes desta falha na 2ª etapa
      // (confirmar). Mantém `pendingBatchCoverage` com o estado antigo pra não perder o contexto —
      // o usuário pode tentar "Confirmar mesmo assim" de novo.
      await refreshCalendario();
      return;
    }
    setPendingBatchCoverage(null);
    await completeCreateResults([...others, ...confirmResults]);
  }

  /**
   * Cancela o(s) aviso(s) de cobertura do lote. Com 1 colaborador só, nada foi gravado ainda (igual
   * ao fluxo de sempre com 1 colaborador) — só fecha o aviso e devolve pro formulário, sem finalizar
   * nada. Com 2+, os demais colaboradores do mesmo lote já podem ter sido gravados de verdade (a
   * criação é por colaborador, não tudo-ou-nada) — por isso finaliza o lote, marcando quem não
   * confirmou como "não criado" no resumo.
   */
  function handleCancelBatchCoverage() {
    if (!pendingBatchCoverage) return;
    if (pendingBatchCoverage.length === 1) {
      setPendingBatchCoverage(null);
      return;
    }
    const resolved: BatchEntryResultDTO[] = pendingBatchCoverage.map((r) =>
      r.status === "coverage_pending"
        ? {
            employeeId: r.employeeId,
            employeeName: r.employeeName,
            status: "error",
            error: "Não criado: cobertura mínima do setor insuficiente e não confirmado.",
          }
        : r
    );
    setPendingBatchCoverage(null);
    void completeCreateResults(resolved);
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
            <button
              type="button"
              onClick={handleExportImage}
              disabled={exporting || dias === null}
              aria-label="Exportar como imagem"
              title="Baixar o calendário deste mês como imagem PNG (pra compartilhar, ex.: no WhatsApp)"
              className="btn-outline text-xs px-2.5 py-1.5 flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <ImageDown size={14} />}
              <span className="hidden sm:inline">{exporting ? "Gerando..." : "Exportar como imagem"}</span>
            </button>
          </div>
        }
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>
        )}
        {exportError && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {exportError}
          </div>
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
                      className={dayCellClassName(isToday, inMonth, clickable)}
                    >
                      <DayCellContent day={day} dia={dia} isToday={isToday} />
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
                            {dia.indisponiveis.length > 0 && <DayPeopleSummary people={dia.indisponiveis} />}
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

      <ExportCalendarCard
        innerRef={exportRef}
        empresaLabel={empresaLabel}
        cursor={cursor}
        diasByDate={diasByDate}
        legendTypes={legendTypes}
        todayKey={todayKey}
      />

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
                          <p className="text-sm text-white font-medium truncate">{nameAndSetor(p)}</p>
                          <ColorBadge color={p.dayOffType.cor}>{p.dayOffType.nome}</ColorBadge>
                        </div>
                        <p className="text-xs text-nord-gray mt-0.5">{p.cargo}</p>
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
              <div>
                <span className="block text-xs text-nord-gray mb-1">
                  Colaborador(es) — marque um ou mais para cadastrar a mesma folga de uma vez
                </span>
                {employees.length === 0 ? (
                  <span className="block text-xs text-nord-warning mt-1">
                    Nenhum colaborador ativo disponível para cadastro de folga.
                  </span>
                ) : (
                  <EmployeeMultiSelect
                    employees={employees}
                    selected={entryForm.employeeIds}
                    onChange={(employeeIds) => setEntryForm({ ...entryForm, employeeIds })}
                  />
                )}
              </div>
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
                onClick={() => (editingEntry ? submitEditEntry(false) : handleSubmitCreate())}
                disabled={entrySubmitting || showNewTypeForm}
                title={showNewTypeForm ? "Cadastre ou cancele o novo tipo de folga antes de salvar" : undefined}
                className="flex-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg py-2.5"
              >
                {entrySubmitting
                  ? "Salvando..."
                  : !editingEntry && entryForm.employeeIds.length > 1
                    ? `Salvar para ${entryForm.employeeIds.length} colaboradores`
                    : "Salvar"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!pendingCoverage}
        title="Cobertura mínima do setor"
        message={pendingCoverage ? formatCoverageMessage(pendingCoverage) : ""}
        onConfirm={() => submitEditEntry(true)}
        onCancel={() => setPendingCoverage(null)}
        confirmLabel={entrySubmitting ? "Confirmando..." : "Confirmar mesmo assim"}
        danger
      />

      <ConfirmDialog
        open={!!pendingBatchCoverage}
        title="Cobertura mínima do setor"
        message={
          pendingBatchCoverage
            ? formatBatchCoverageMessage(
                pendingBatchCoverage.filter(
                  (r): r is BatchEntryResultDTO & { status: "coverage_pending" } => r.status === "coverage_pending"
                )
              )
            : ""
        }
        onConfirm={handleConfirmBatchCoverage}
        onCancel={handleCancelBatchCoverage}
        confirmLabel={entrySubmitting ? "Confirmando..." : "Confirmar mesmo assim"}
        danger
      />

      <Modal open={!!batchResult} onClose={() => setBatchResult(null)} title="Resultado do cadastro de folgas">
        {batchResult && (
          <div className="space-y-3">
            {batchResult.createdCount > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-nord-success/10 border border-nord-success/30">
                <CheckCircle2 size={14} className="text-nord-success mt-0.5 shrink-0" />
                <p className="text-xs text-nord-success">
                  Folga cadastrada com sucesso para {batchResult.createdCount} de {batchResult.results.length}{" "}
                  colaborador(es).
                </p>
              </div>
            )}
            {batchResult.results.some((r) => r.status !== "created") && (
              <div className="p-3 rounded-lg bg-nord-warning/10 border border-nord-warning/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-nord-warning mt-0.5 shrink-0" />
                  <p className="text-xs text-nord-warning">
                    {batchResult.results.filter((r) => r.status !== "created").length} colaborador(es) não tiveram a
                    folga cadastrada:
                  </p>
                </div>
                <ul className="mt-2 ml-6 list-disc space-y-1 text-xs text-nord-gray">
                  {batchResult.results
                    .filter((r): r is BatchEntryResultDTO & { status: "error" } => r.status === "error")
                    .map((r) => (
                      <li key={r.employeeId}>
                        <span className="text-white">{r.employeeName ?? "Um colaborador"}</span>
                        {" — "}
                        {r.error}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <button onClick={() => setBatchResult(null)} className="btn-primary w-full mt-4 py-2.5">
          Fechar
        </button>
      </Modal>

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
