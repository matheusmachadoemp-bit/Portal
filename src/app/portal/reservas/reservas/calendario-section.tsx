"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Section, Badge } from "@/components/ui/stat-card";
import { MonthCalendar } from "@/components/ui/month-calendar";
import { storedDayKey } from "@/lib/timezone";
import { RESERVATION_STATUS_LABEL, RESERVATION_STATUS_TONE, RESERVATION_DAY_OCCUPANCY_STATUSES } from "@/lib/reservas";
import type { ReservationDTO } from "./reservas-client";

/** "YYYY-MM-DD" a partir dos componentes LOCAIS do `Date` (ano/mês/dia) — nunca
 * `toISOString().slice(0, 10)`, que usa UTC e pode cair no dia errado dependendo do fuso do
 * navegador (ex.: 23h de um dia em UTC-3 já é o dia seguinte em UTC). Mesmo cuidado de
 * `storedDayKey` (src/lib/timezone.ts), só que aqui para um `Date` "de calendário" sem hora real
 * (os dias da grade do `MonthCalendar`), não um instante gravado no banco. */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "DD/MM/AAAA" a partir de um "AAAA-MM-DD" só com manipulação de string — nunca via `Date`/
 * `date-fns` aqui: um dateKey não tem hora real anexada, então qualquer parsing por instante
 * (mesmo com hora fixa "meio-dia") reintroduziria o mesmo risco de fuso horário que `localDateKey`
 * acima evita. */
function formatDateKeyBR(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}/${m}/${y}`;
}

function monthRange(cursor: Date): { dateFrom: string; dateTo: string } {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    dateFrom: `${year}-${String(month + 1).padStart(2, "0")}-01`,
    dateTo: `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Seção "Calendário" dentro da tela "Reservas" (ver `reservas-client.tsx`) — a partir da tarefa
 * "reservas-unificar-calendario" (itens #151/#152 do backlog: unificar a extinta tela/rota
 * `/portal/reservas/calendario` com a tela "Reservas", ver prisma/migrations/
 * 20261102070000_reservas_unificar_calendario_lista), este componente (antes `CalendarioClient`,
 * renderizado numa página própria) vira só uma seção no topo da tela "Reservas", empilhada acima
 * da lista/filtros/criação manual — mesmo padrão já usado pra juntar "Relatórios" dentro de
 * "Visão Geral" (duas seções client component independentes, cada uma com seu próprio fetch,
 * numa página só; ver `src/app/portal/reservas/visao-geral/page.tsx` +
 * `relatorios-periodo-client.tsx`). Continua 100% autocontido (próprio estado de mês/dia
 * selecionado, próprio fetch de `GET /api/reservas/reservas`/`GET /api/reservas/resumo`) — não
 * está acoplado ao filtro de data/status da lista abaixo nem vice-versa.
 *
 * Única ponte entre as duas seções: `reservationsVersion` (ver `reservas-client.tsx`) — um
 * contador que o pai incrementa depois de um PATCH de status bem-sucedido na Lista. Achado do
 * Teulis na revisão: sem isso, o badge de ocupação do dia ficava mostrando um número
 * desatualizado até um reload manual da página, porque este componente só refazia o fetch quando
 * o mês visível (`cursor`) mudava. Em vez de o pai manipular o estado interno (`reservations`)
 * deste componente diretamente, ele só sinaliza "algo mudou" através da prop — este componente
 * decide por conta própria como reagir (refazer o mesmo fetch do mês atual), mantendo as duas
 * seções desacopladas uma da outra.
 */
export function CalendarioSection({
  hasEmpresa,
  multiEmpresa,
  todayKey,
  reservationsVersion,
}: {
  hasEmpresa: boolean;
  multiEmpresa: boolean;
  todayKey: string;
  reservationsVersion: number;
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const [reservations, setReservations] = useState<ReservationDTO[]>([]);
  const [loading, setLoading] = useState(hasEmpresa);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);

  // Capacidade total (soma de `ReservationEnvironment.capacity` dos ambientes ativos da loja/lojas
  // ativas) para o denominador do badge de ocupação de cada dia (ver `renderDay` abaixo) — vem de
  // `GET /api/reservas/resumo` (mesma agregação já usada pela "Visão Geral", ver
  // `src/lib/reservas-resumo.ts`: `occupancy.totalCapacity`), em vez de reimplementar essa soma
  // aqui. Não varia por dia da semana/mês (o schema não tem capacidade específica por dia — só
  // `ReservationWeekdayHours.open`/horário, ver comentário completo no relatório da tarefa), então
  // basta buscar 1x quando a loja ativa é definida, nunca 1x por dia nem por mês.
  const [totalCapacity, setTotalCapacity] = useState<number | null>(null);

  useEffect(() => {
    if (!hasEmpresa) return;
    let cancelled = false;
    async function loadCapacity() {
      try {
        const res = await fetch("/api/reservas/resumo");
        const json = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const capacity = json?.resumo?.occupancy?.totalCapacity;
        if (typeof capacity === "number") setTotalCapacity(capacity);
      } catch {
        // Sem capacidade carregada, o badge de ocupação simplesmente não aparece (ver renderDay) —
        // não é um erro grave o bastante para mostrar outra mensagem além do que já existe pra
        // `loadError` (reservas do mês).
      }
    }
    loadCapacity();
    return () => {
      cancelled = true;
    };
  }, [hasEmpresa]);

  useEffect(() => {
    if (!hasEmpresa) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const { dateFrom, dateTo } = monthRange(cursor);
        const params = new URLSearchParams({ dateFrom, dateTo });
        const res = await fetch(`/api/reservas/reservas?${params.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json.error ?? "Não foi possível carregar as reservas do mês.");
          return;
        }
        setReservations(json.reservations ?? []);
      } catch {
        if (!cancelled) setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // `reservationsVersion` entra na dependência só para refazer este MESMO fetch (mês atual,
    // `cursor` inalterado) quando a Lista muda o status de uma reserva — ver comentário da prop
    // acima. Não reagimos a `totalCapacity`/`loadCapacity` aqui porque a mudança de status de uma
    // reserva nunca altera a capacidade total dos ambientes, só a ocupação.
  }, [hasEmpresa, cursor, reservationsVersion]);

  const byDay = useMemo(() => {
    const map = new Map<string, ReservationDTO[]>();
    for (const r of reservations) {
      const key = storedDayKey(r.date);
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [reservations]);

  // Numerador do badge de ocupação: soma de `partySize` das reservas do dia com status que conta
  // como "ocupação confirmada" (ver `RESERVATION_DAY_OCCUPANCY_STATUSES`, src/lib/reservas.ts) —
  // agregado em memória a partir das reservas do mês JÁ carregadas por `byDay` acima (mesma busca
  // de `GET /api/reservas/reservas` com o range do mês, nenhuma query extra por dia).
  const confirmedPartySizeByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const [key, list] of byDay) {
      const sum = list
        .filter((r) => RESERVATION_DAY_OCCUPANCY_STATUSES.includes(r.status))
        .reduce((total, r) => total + r.partySize, 0);
      map.set(key, sum);
    }
    return map;
  }, [byDay]);

  const selectedReservations = byDay.get(selectedDay) ?? [];

  if (!hasEmpresa) {
    return <div className="nord-card p-8 text-center text-sm text-nord-gray">Selecione uma loja para ver o calendário de reservas.</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
      <div className="nord-card p-4">
        {loadError && <p className="text-xs text-nord-danger mb-3">{loadError}</p>}
        <MonthCalendar
          cursor={cursor}
          onCursorChange={(next) => {
            setCursor(next);
            setSelectedDay(localDateKey(next));
          }}
          renderDay={(day, { inMonth, isToday }) => {
            const key = localDateKey(day);
            const confirmedPartySize = confirmedPartySizeByDay.get(key) ?? 0;
            const isSelected = selectedDay === key;
            return (
              <button
                type="button"
                onClick={() => setSelectedDay(key)}
                disabled={!inMonth}
                className={`w-full h-16 rounded-lg border p-1.5 flex flex-col items-start justify-between gap-1 text-left transition-colors ${
                  !inMonth
                    ? "border-transparent opacity-30 cursor-default"
                    : isSelected
                      ? "border-nord-blue bg-nord-blue/10"
                      : isToday
                        // Dia atual: fundo diferente dos demais (ver prompt da tarefa), mesmo sem
                        // estar selecionado — sutil o bastante pra não parecer selecionado de
                        // verdade (`bg-white/5`, bem mais claro que `bg-nord-blue/10` do selecionado).
                        ? "border-nord-blue/50 bg-white/5 hover:border-nord-blue"
                        : "border-nord-border/40 hover:border-nord-border"
                }`}
              >
                <span className={`text-xs ${isToday ? "text-nord-blue-light font-semibold" : "text-white"}`}>{day.getDate()}</span>
                {/* Badge de ocupação do dia: círculo vermelho com pessoas confirmadas + "/capacidade"
                    em laranja (ver prompt da tarefa) — só aparece em dias do mês com capacidade
                    carregada; `confirmedPartySize` pode ser 0 (dia aberto sem reserva confirmada
                    ainda) e ainda assim é útil mostrar "0/44". */}
                {inMonth && totalCapacity !== null && totalCapacity > 0 && (
                  <span className="flex items-center gap-1 self-start">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-nord-danger text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {confirmedPartySize}
                    </span>
                    <span className="text-[10px] font-semibold text-amber-400 leading-none">/{totalCapacity}</span>
                  </span>
                )}
              </button>
            );
          }}
        />
        {loading && <p className="text-xs text-nord-gray mt-2">Carregando...</p>}
      </div>

      <Section title={`Reservas em ${formatDateKeyBR(selectedDay)}`}>
        {selectedReservations.length === 0 ? (
          <p className="text-sm text-nord-gray py-2">Nenhuma reserva neste dia.</p>
        ) : (
          <div className="space-y-1.5">
            {selectedReservations.map((r) => (
              <div key={r.id} className="rounded-lg border border-nord-border/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-white font-medium">{format(parseISO(r.startTime), "HH:mm")}</span>
                  <Badge tone={RESERVATION_STATUS_TONE[r.status] ?? "default"}>
                    {RESERVATION_STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </div>
                <p className="text-sm text-white mt-1 truncate">{r.customerName ?? r.cliente?.nome ?? "—"}</p>
                <p className="text-xs text-nord-gray mt-0.5">
                  {r.partySize} pessoas — {r.environment.name}
                  {multiEmpresa && ` — ${r.empresa.name}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
