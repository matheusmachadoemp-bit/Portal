"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, DoorClosed } from "lucide-react";
import { Section, ColorBadge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { MonthCalendar } from "@/components/ui/month-calendar";

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
}: {
  /** Líder — a API já restringe o resultado ao próprio setor dele, então o filtro fica fixo. */
  isSupervisor: boolean;
  ownSetor: string | null;
  /** Catálogo completo de setores (vazio quando `isSupervisor`, que não usa o filtro). */
  setores: string[];
  isGrupoNordMode: boolean;
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

  useEffect(() => {
    if (skipFetch) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const { from, to } = monthRange(cursor);
      const params = new URLSearchParams({ from, to });
      if (!isSupervisor && setorFilter) params.set("setor", setorFilter);
      try {
        const res = await fetch(`/api/rh/escala-folgas/calendario?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? "Não foi possível carregar o calendário.");
          setDias([]);
          return;
        }
        setDias(data.dias ?? []);
      } catch {
        if (!cancelled) {
          setError("Falha de conexão ao carregar o calendário. Verifique sua internet e tente novamente.");
          setDias([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [cursor, setorFilter, isSupervisor, skipFetch]);

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
                  return (
                    <button
                      type="button"
                      disabled={!hasData}
                      onClick={() => hasData && setSelectedDate(key)}
                      className={`w-full min-h-[92px] rounded-lg border p-1.5 text-left flex flex-col ${
                        isToday ? "border-nord-blue bg-nord-blue/10" : "border-nord-border/60 bg-nord-panel/40"
                      } ${inMonth ? "" : "opacity-40"} ${hasData ? "hover:border-nord-blue/60 cursor-pointer" : "cursor-default"}`}
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
                  const isToday = dia.date === todayKey;
                  return (
                    <button
                      key={dia.date}
                      type="button"
                      disabled={!hasData}
                      onClick={() => setSelectedDate(dia.date)}
                      className={`w-full flex items-center gap-3 rounded-lg border p-2.5 text-left ${
                        isToday ? "border-nord-blue bg-nord-blue/10" : "border-nord-border/60 bg-nord-panel/40"
                      } ${hasData ? "hover:border-nord-blue/60 cursor-pointer" : "cursor-default"}`}
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

      <Modal
        open={!!selectedDate}
        onClose={() => setSelectedDate(null)}
        title={
          selectedDia
            ? capitalize(format(dateFromKey(selectedDia.date), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR }))
            : "Detalhes do dia"
        }
      >
        {selectedDia && (
          <div className="space-y-4">
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
                {selectedDia.indisponiveis.map((p) => (
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
