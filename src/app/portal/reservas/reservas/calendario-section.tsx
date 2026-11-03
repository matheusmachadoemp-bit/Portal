"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Bell } from "lucide-react";
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
 * selecionado, próprio fetch de `GET /api/reservas/reservas` — inclusive a capacidade total dos
 * ambientes, ver `totalCapacity`/`includeCapacity` abaixo) — não está acoplado ao filtro de
 * data/status da lista abaixo nem vice-versa.
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
  // ativas) para o denominador do badge de ocupação de cada dia (ver `renderDay` abaixo). Não
  // varia por dia da semana/mês (o schema não tem capacidade específica por dia — só
  // `ReservationWeekdayHours.open`/horário, ver comentário completo no relatório da tarefa), então
  // basta buscar 1x quando a loja ativa é definida, nunca 1x por dia nem por mês.
  //
  // Achado #166 (revisão geral, Nina): antes vinha de um fetch PRÓPRIO a `GET /api/reservas/resumo`
  // — endpoint pesado (calcula `todayCount`, `pendingConfirmation`, `noShow` etc., ver
  // `src/lib/reservas-resumo.ts`) só pra extrair `occupancy.totalCapacity`, nada do resto usado
  // aqui. Agora é só mais um campo (`includeCapacity=1`, ver JSDoc de
  // `src/app/api/reservas/reservas/route.ts`) pedido no MESMO fetch do mês que este componente já
  // faz abaixo — nenhum fetch extra. `capacityRequestedRef` garante que o parâmetro só é enviado
  // na 1ª vez que o efeito abaixo roda após o componente montar (capacidade não muda por mês,
  // continua valendo buscar 1x só) — nas trocas de mês/`reservationsVersion` seguintes, o mesmo
  // fetch do mês roda sem o campo extra.
  const [totalCapacity, setTotalCapacity] = useState<number | null>(null);
  const capacityRequestedRef = useRef(false);

  useEffect(() => {
    if (!hasEmpresa) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      const needsCapacity = !capacityRequestedRef.current;
      try {
        const { dateFrom, dateTo } = monthRange(cursor);
        const params = new URLSearchParams({ dateFrom, dateTo });
        if (needsCapacity) params.set("includeCapacity", "1");
        const res = await fetch(`/api/reservas/reservas?${params.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json.error ?? "Não foi possível carregar as reservas do mês.");
          return;
        }
        setReservations(json.reservations ?? []);
        if (needsCapacity) {
          capacityRequestedRef.current = true;
          if (typeof json.totalCapacity === "number") setTotalCapacity(json.totalCapacity);
        }
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
    // acima. Não reagimos a `totalCapacity` aqui porque a mudança de status de uma reserva nunca
    // altera a capacidade total dos ambientes, só a ocupação (e `capacityRequestedRef` já garante
    // que a capacidade não é pedida de novo nessas re-execuções).
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

  // Dias com pelo menos uma reserva PENDENTE (ainda aguardando aprovação) — só para desenhar o
  // sininho de alerta no card do dia (ver `renderDay` abaixo), nenhum cálculo de ocupação envolvido
  // aqui (diferente de `confirmedPartySizeByDay` acima, que exclui PENDENTE de propósito). Mesmo
  // padrão de agregação em memória a partir de `byDay`, sem fetch extra.
  const hasPendingByDay = useMemo(() => {
    const set = new Set<string>();
    for (const [key, list] of byDay) {
      if (list.some((r) => r.status === "PENDENTE")) set.add(key);
    }
    return set;
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
            const hasPending = hasPendingByDay.has(key);
            const isSelected = selectedDay === key;
            return (
              <button
                type="button"
                onClick={() => setSelectedDay(key)}
                disabled={!inMonth}
                className={`relative w-full h-16 rounded-lg border p-1.5 flex flex-col items-start justify-between overflow-hidden text-left transition-colors ${
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
                {/* Número do dia: sozinho na própria linha (sem dividir espaço com o sininho —
                    ver histórico abaixo sobre por que isso importa). */}
                <span className={`text-xs ${isToday ? "text-nord-blue-light font-semibold" : "text-white"}`}>{day.getDate()}</span>
                {/* Sininho de alerta: dia com pelo menos uma reserva PENDENTE (solicitação ainda
                    não analisada) — ver `hasPendingByDay` acima.
                    Achado do Teulis (revisão desta tarefa): a tentativa anterior colocava o
                    sininho ao lado do número, na mesma linha flex (`justify-between`) — medindo
                    de verdade com `getBoundingClientRect()` (não só visualmente), a 320px um dia
                    de 2 dígitos SOZINHO (ex. "20") já ocupa ~15,3px de um espaço útil de ~14,9px
                    disponíveis na célula — ou seja, não sobra espaço nenhum pro sino do lado,
                    nem encolhendo o ícone ao mínimo legível; o sino vazava pra fora da própria
                    célula e cruzava a borda da célula vizinha (confirmado: ~8,4px de transbordo a
                    320px, ~2,7px a 360px, ~0,6px a 375px). `gap-1`/`justify-between` só distribuem
                    espaço quando sobra — não impedem transbordo quando o conteúdo excede a
                    largura disponível, e não havia `overflow-hidden` contendo isso.
                    Correção: o sino sai da linha do número (não compete mais por LARGURA com o
                    número, que é o que realmente faltava a 320px) e vira `absolute`, ancorado por
                    ALTURA — centralizado verticalmente entre a linha do número (topo) e a linha do
                    badge de ocupação (base) via `top-1/2 -translate-y-1/2`, relativo à própria
                    altura do ícone. Isso o mantém geometricamente dentro do botão (`relative`,
                    `overflow-hidden` acima como segunda camada de proteção) em QUALQUER largura de
                    celular e com QUALQUER quantidade de dígitos no número — validado medindo
                    `getBoundingClientRect()` de verdade via Chromium headless, varrendo 280-500px
                    (passo de 4px): sino nunca ultrapassa a borda da própria célula, nunca
                    sobrepõe o número nem o badge, nunca vaza pra célula vizinha. */}
                {inMonth && hasPending && (
                  <Bell
                    size={9}
                    strokeWidth={2.5}
                    className="absolute top-1/2 -translate-y-1/2 right-1 text-nord-warning"
                    aria-label="Há reserva pendente de aprovação neste dia"
                  />
                )}
                {/* Badge de ocupação do dia: círculo com pessoas confirmadas + "/capacidade" — só
                    aparece em dias do mês com capacidade carregada; `confirmedPartySize` pode ser 0
                    (dia aberto sem reserva confirmada ainda) e ainda assim é útil mostrar "0/44".
                    Tarefa #153: dia sem nenhuma pessoa ocupando fica CINZA (mesmo tom neutro do
                    tone "default" do `Badge`, ver DESIGN_SYSTEM.md: `bg-white/10 text-nord-gray`)
                    em vez de vermelho/laranja — a cor de alerta só faz sentido quando há ocupação
                    real (`confirmedPartySize > 0`), senão o dia vazio parecia alarmante sem motivo
                    (achado reportado pelo Matheus).
                    Achado da revisão visual (item #194, Caio): empilhado na VERTICAL (círculo em
                    cima, "/capacidade" embaixo) em vez de lado a lado — a célula é estreita (chega
                    a ~29px de largura útil a 320px, e segue quase tão apertada a 1024px, onde o
                    calendário divide a linha com o painel "Reservas em DD/MM" ao lado — só a
                    partir de telas bem largas a célula sobra espaço de sobra pra um layout
                    horizontal), mas tem ALTURA de sobra (célula de 64px, só o número do dia ocupa a
                    linha de cima). Medido com getBoundingClientRect(): o círculo sozinho (20px) já
                    ocupava quase toda a largura útil da célula a 320px, sem sobrar espaço nenhum
                    pro texto "/144" do lado — por isso ele cortava (texto saindo ~22px da própria
                    célula, confirmado via Chromium headless). Empilhar aproveita a dimensão que
                    sobra (altura) em vez da que falta (largura), em qualquer largura de tela. */}
                {inMonth && totalCapacity !== null && totalCapacity > 0 && (
                  <span className="flex flex-col items-start gap-0.5 self-start">
                    <span
                      className={`w-5 h-5 shrink-0 rounded-full text-[10px] font-bold flex items-center justify-center leading-none ${
                        confirmedPartySize > 0 ? "bg-nord-danger text-white" : "bg-white/10 text-nord-gray"
                      }`}
                    >
                      {confirmedPartySize}
                    </span>
                    <span
                      className={`text-[9px] font-semibold leading-none whitespace-nowrap ${
                        confirmedPartySize > 0 ? "text-amber-400" : "text-nord-gray"
                      }`}
                    >
                      /{totalCapacity}
                    </span>
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
