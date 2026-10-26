"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, Users } from "lucide-react";
import { MonthCalendar } from "@/components/ui/month-calendar";
import { apiRequest } from "@/lib/api-client";
import { onlyDigits } from "@/lib/reservas";

type Environment = { id: string; name: string; capacity: number };

type DayStatus = "fechado" | "bloqueado" | "fora-do-prazo" | "sem-horario" | "disponivel";
type DayAvailability = { dateKey: string; status: DayStatus; isSpecialGroup?: boolean };

type AvailabilityOption = {
  type: "mesa" | "combinacao";
  id: string;
  label: string;
  tableIds: string[];
  capacityMin: number;
  capacityMax: number;
};
type AvailabilitySlot = {
  time: string;
  startTime: string;
  endTime: string;
  withinAdvanceWindow: boolean;
  available: boolean;
  options: AvailabilityOption[];
};
type DayDetail =
  | { open: false; reason: "bloqueado" | "fechado" | "fora-do-prazo"; blockedReason?: string | null }
  | { open: true; openTime: string; closeTime: string; isSpecialGroup: boolean; slots: AvailabilitySlot[] };

type Step = "formulario" | "dados" | "confirmacao";

// Mesmo racional de `onlyDigits`/`formatTelefone` em `avaliar-client.tsx`: formatação é só visual
// (o backend recebe/valida os dígitos), reimplementada aqui em vez de importada de um módulo
// "-server" (este arquivo é "use client", nunca pode puxar o Prisma Client pro bundle).
function formatTelefone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKeyOf(cursor: Date): string {
  return `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
}

/** Cor da pílula de cada dia do calendário, por status de disponibilidade (ver
 * `getMonthAvailability`, src/lib/reservas-disponibilidade.ts). */
const DAY_STATUS_STYLE: Record<DayStatus, string> = {
  disponivel: "bg-nord-success/15 border-nord-success text-nord-success hover:bg-nord-success/25",
  "sem-horario": "bg-amber-500/10 border-amber-500/40 text-amber-400",
  fechado: "bg-transparent border-transparent text-nord-gray/30",
  bloqueado: "bg-transparent border-transparent text-nord-gray/30",
  "fora-do-prazo": "bg-transparent border-transparent text-nord-gray/20",
};

function formatDiaExtenso(dateKey: string): string {
  // Só para exibição — o "AAAA-MM-DDT12:00:00" (meio-dia) evita qualquer problema de fuso horário
  // do navegador empurrar o dia pra trás/frente ao converter string->Date.
  const d = new Date(`${dateKey}T12:00:00`);
  return format(d, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function ReservarClient({
  empresaKey,
  empresa,
  environments,
}: {
  empresaKey: string;
  empresa: { name: string; logo: string | null; color: string };
  environments: Environment[];
}) {
  const [step, setStep] = useState<Step>("formulario");

  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? "");
  const [partySize, setPartySize] = useState(2);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [days, setDays] = useState<Record<string, DayAvailability>>({});
  const [loadingMonth, setLoadingMonth] = useState(false);

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ confirmationCode: string } | null>(null);

  const selectedEnvironment = environments.find((e) => e.id === environmentId) ?? null;

  // Recarrega o resumo do mês sempre que ambiente, quantidade de pessoas ou o mês visível mudam —
  // a seleção de dia/horário feita antes não vale mais nesse novo contexto (ex.: trocar de 2 pra 12
  // pessoas pode deixar um dia antes "disponível" agora "sem horário").
  useEffect(() => {
    if (!environmentId || partySize < 1) return;
    let cancelled = false;
    async function load() {
      setLoadingMonth(true);
      setError(null);
      const params = new URLSearchParams({ ambienteId: environmentId, pessoas: String(partySize), mes: monthKeyOf(monthCursor) });
      const res = await apiRequest<{ days: DayAvailability[] }>(`/api/reservar/${empresaKey}/disponibilidade?${params}`, "GET");
      if (cancelled) return;
      setLoadingMonth(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const map: Record<string, DayAvailability> = {};
      for (const d of res.data.days) map[d.dateKey] = d;
      setDays(map);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [empresaKey, environmentId, partySize, monthCursor]);

  // Seleção de dia/horário não sobrevive a uma troca de ambiente/pessoas (ver comentário acima).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa a seleção de dia/horário, que não vale mais sob o novo ambiente/pessoas
    setSelectedDateKey(null);
    setDayDetail(null);
    setSelectedTime(null);
  }, [environmentId, partySize]);

  function selectDay(dateKey: string) {
    const info = days[dateKey];
    if (!info || info.status === "fechado" || info.status === "bloqueado" || info.status === "fora-do-prazo") return;
    setSelectedDateKey(dateKey);
    setSelectedTime(null);
    setDayDetail(null);
    setError(null);
    setLoadingDay(true);
    const params = new URLSearchParams({ ambienteId: environmentId, pessoas: String(partySize), data: dateKey });
    apiRequest<DayDetail>(`/api/reservar/${empresaKey}/disponibilidade?${params}`, "GET").then((res) => {
      setLoadingDay(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDayDetail(res.data);
    });
  }

  const canAdvance = !!(environmentId && partySize >= 1 && selectedDateKey && selectedTime);

  function goToDados() {
    setError(null);
    if (!canAdvance) {
      setError("Escolha ambiente, quantidade de pessoas, data e horário antes de continuar.");
      return;
    }
    setStep("dados");
  }

  async function confirmarReserva() {
    setError(null);
    if (!nome.trim()) return setError("Informe seu nome.");
    const telefoneDigits = onlyDigits(telefone);
    if (telefoneDigits.length < 10) return setError("Informe um telefone válido, com DDD.");
    if (submitting) return;
    setSubmitting(true);
    const res = await apiRequest<{ reservation: { confirmationCode: string } }>(`/api/reservar/${empresaKey}/reservas`, "POST", {
      ambienteId: environmentId,
      data: selectedDateKey,
      horario: selectedTime,
      pessoas: partySize,
      nome: nome.trim(),
      telefone: telefoneDigits,
      email: email.trim() || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      // Horário pode ter ficado indisponível entre a seleção e o envio — volta pro passo anterior
      // e refaz a consulta do dia pra mostrar os horários realmente livres agora.
      if (selectedDateKey) selectDay(selectedDateKey);
      setStep("formulario");
      return;
    }
    setConfirmation({ confirmationCode: res.data.reservation.confirmationCode });
    setStep("confirmacao");
  }

  function novaReserva() {
    setConfirmation(null);
    setSelectedDateKey(null);
    setDayDetail(null);
    setSelectedTime(null);
    setNome("");
    setTelefone("");
    setEmail("");
    setError(null);
    setStep("formulario");
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col p-5">
      <header className="flex items-center gap-2 mb-4">
        {empresa.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- página pública fora do /portal, mesmo padrão simples já usado nas demais páginas públicas (sem next/image aqui).
          <img src={empresa.logo} alt={empresa.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: empresa.color }} />
        )}
        <span className="text-white font-semibold truncate">{empresa.name}</span>
        <span className="text-nord-gray text-xs ml-auto">Reservar mesa</span>
      </header>

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/5 p-2.5">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {step === "formulario" && (
        <div className="space-y-5 pb-6">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Ambiente</span>
              <div className="relative">
                <select value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)} className="input appearance-none pr-8">
                  {environments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
              </div>
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Pessoas</span>
              <input
                type="number"
                min={1}
                value={partySize}
                onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
                className="input"
              />
            </label>
          </div>

          <div className="bg-nord-panel border border-nord-border rounded-2xl p-3">
            <div className="flex items-center gap-1.5 mb-2 text-xs text-nord-gray">
              <CalendarDays size={14} />
              <span>Escolha a data{loadingMonth ? " — carregando..." : ""}</span>
            </div>
            <MonthCalendar
              cursor={monthCursor}
              onCursorChange={setMonthCursor}
              renderDay={(day, ctx) => {
                const dateKey = dateKeyOf(day);
                const info = days[dateKey];
                const status = info?.status;
                const clickable = ctx.inMonth && status === "disponivel";
                const selected = selectedDateKey === dateKey;
                return (
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => selectDay(dateKey)}
                    className={`w-full aspect-square rounded-lg text-[11px] font-medium border flex items-center justify-center transition ${
                      !ctx.inMonth
                        ? "text-nord-gray/15 border-transparent"
                        : status
                          ? DAY_STATUS_STYLE[status]
                          : "border-nord-border text-nord-gray/40"
                    } ${selected ? "ring-2 ring-nord-blue" : ""} ${ctx.isToday ? "font-bold" : ""}`}
                  >
                    {day.getDate()}
                  </button>
                );
              }}
            />
            <div className="flex items-center gap-3 mt-2.5 text-[10px] text-nord-gray">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-nord-success" /> Tem horário
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> Sem horário
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-nord-gray/30" /> Fechado
              </span>
            </div>
          </div>

          {selectedDateKey && (
            <div className="bg-nord-panel border border-nord-border rounded-2xl p-3">
              <p className="text-xs text-nord-gray mb-2 capitalize">{formatDiaExtenso(selectedDateKey)}</p>
              {loadingDay && <p className="text-nord-gray text-xs">Carregando horários...</p>}
              {!loadingDay && dayDetail?.open && (
                <>
                  {dayDetail.isSpecialGroup && (
                    <p className="text-[11px] text-amber-400 mb-2">
                      Grupo grande — a disponibilidade de horários pode ser mais limitada.
                    </p>
                  )}
                  <div className="grid grid-cols-4 gap-1.5">
                    {dayDetail.slots.map((s) => (
                      <button
                        key={s.time}
                        type="button"
                        disabled={!s.available}
                        onClick={() => setSelectedTime(s.time)}
                        className={`py-2 rounded-lg text-xs font-medium border transition ${
                          selectedTime === s.time
                            ? "bg-nord-blue border-nord-blue text-white"
                            : s.available
                              ? "bg-transparent border-nord-border text-white hover:border-white/30"
                              : "bg-transparent border-nord-border/40 text-nord-gray/30 line-through"
                        }`}
                      >
                        {s.time}
                      </button>
                    ))}
                  </div>
                  {dayDetail.slots.every((s) => !s.available) && (
                    <p className="text-nord-gray text-xs mt-2">Nenhum horário livre neste dia para esse ambiente/quantidade.</p>
                  )}
                </>
              )}
              {!loadingDay && dayDetail && !dayDetail.open && (
                <p className="text-nord-gray text-xs">
                  {dayDetail.reason === "bloqueado" && (dayDetail.blockedReason || "Esta data não está disponível para reservas.")}
                  {dayDetail.reason === "fechado" && "Fechado neste dia."}
                  {dayDetail.reason === "fora-do-prazo" && "Fora do prazo de antecedência para reserva."}
                </p>
              )}
            </div>
          )}

          <button onClick={goToDados} disabled={!canAdvance} className="btn-primary w-full py-3 text-sm font-semibold disabled:opacity-50">
            AVANÇAR PARA SEUS DADOS
          </button>
        </div>
      )}

      {step === "dados" && (
        <div className="space-y-4 pb-6">
          <div className="bg-nord-panel border border-nord-border rounded-2xl p-3 text-xs text-nord-gray space-y-1">
            <p className="flex items-center gap-1.5">
              <CalendarDays size={13} /> <span className="capitalize">{selectedDateKey && formatDiaExtenso(selectedDateKey)}</span> às{" "}
              {selectedTime}
            </p>
            <p className="flex items-center gap-1.5">
              <Users size={13} /> {partySize} pessoa{partySize > 1 ? "s" : ""} · {selectedEnvironment?.name}
            </p>
          </div>

          <p className="text-white text-lg font-semibold text-center">Seus dados</p>

          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="input" placeholder="Seu nome completo" autoFocus />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">WhatsApp ou celular</span>
            <input
              type="tel"
              inputMode="numeric"
              value={telefone}
              onChange={(e) => setTelefone(formatTelefone(e.target.value))}
              className="input"
              placeholder="(00) 00000-0000"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">E-mail (opcional)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="seuemail@exemplo.com" />
          </label>

          <div className="flex items-center gap-2 pt-2">
            <button onClick={() => setStep("formulario")} className="px-4 py-3 rounded-lg text-sm border border-nord-border text-nord-gray flex items-center gap-1.5">
              <ArrowLeft size={14} /> Voltar
            </button>
            <button onClick={confirmarReserva} disabled={submitting} className="btn-primary flex-1 py-3 text-sm font-semibold disabled:opacity-50">
              {submitting ? "Confirmando..." : "Confirmar reserva"}
            </button>
          </div>
        </div>
      )}

      {step === "confirmacao" && confirmation && (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-10">
          <CheckCircle2 size={44} className="text-nord-success" />
          <div>
            <p className="text-white text-lg font-semibold">Reserva confirmada!</p>
            <p className="text-nord-gray text-sm mt-1">Guarde o código abaixo — ele identifica sua reserva.</p>
          </div>
          <div className="bg-nord-panel border border-nord-border rounded-2xl px-6 py-3">
            <span className="text-2xl font-bold tracking-[0.3em] text-white">{confirmation.confirmationCode}</span>
          </div>
          <div className="bg-nord-panel border border-nord-border rounded-2xl p-4 text-sm text-left space-y-1.5 w-full max-w-xs">
            <p className="text-white capitalize">{selectedDateKey && formatDiaExtenso(selectedDateKey)}</p>
            <p className="text-nord-gray">Horário: {selectedTime}</p>
            <p className="text-nord-gray">Ambiente: {selectedEnvironment?.name}</p>
            <p className="text-nord-gray">
              {partySize} pessoa{partySize > 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={novaReserva} className="btn-outline text-sm px-4 py-2.5">
            Fazer outra reserva
          </button>
        </div>
      )}
    </div>
  );
}
