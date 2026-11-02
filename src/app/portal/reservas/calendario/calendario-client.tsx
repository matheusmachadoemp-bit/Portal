"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Section, Badge } from "@/components/ui/stat-card";
import { MonthCalendar } from "@/components/ui/month-calendar";
import { storedDayKey } from "@/lib/timezone";
import { RESERVATION_STATUS_LABEL, RESERVATION_STATUS_TONE } from "@/lib/reservas";
import type { ReservationDTO } from "../reservas/reservas-client";

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

export function CalendarioClient({
  hasEmpresa,
  multiEmpresa,
  todayKey,
}: {
  hasEmpresa: boolean;
  multiEmpresa: boolean;
  todayKey: string;
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const [reservations, setReservations] = useState<ReservationDTO[]>([]);
  const [loading, setLoading] = useState(hasEmpresa);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);

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
  }, [hasEmpresa, cursor]);

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
            const count = byDay.get(key)?.length ?? 0;
            const isSelected = selectedDay === key;
            return (
              <button
                type="button"
                onClick={() => setSelectedDay(key)}
                disabled={!inMonth}
                className={`w-full h-16 rounded-lg border p-1.5 flex flex-col items-start gap-1 text-left transition-colors ${
                  !inMonth
                    ? "border-transparent opacity-30 cursor-default"
                    : isSelected
                      ? "border-nord-blue bg-nord-blue/10"
                      : isToday
                        ? "border-nord-blue/50 hover:border-nord-blue"
                        : "border-nord-border/40 hover:border-nord-border"
                }`}
              >
                <span className={`text-xs ${isToday ? "text-nord-blue-light font-semibold" : "text-white"}`}>{day.getDate()}</span>
                {count > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-nord-blue/20 text-nord-blue-light font-medium">
                    {count} {count === 1 ? "reserva" : "reservas"}
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
                  {r.tables.length > 0 && ` (${r.tables.map((t) => t.identificacao).join(" + ")})`}
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
