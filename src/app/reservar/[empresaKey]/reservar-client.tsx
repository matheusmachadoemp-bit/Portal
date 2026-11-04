"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, Users } from "lucide-react";
import { MonthCalendar } from "@/components/ui/month-calendar";
import { apiRequest } from "@/lib/api-client";
import { onlyDigits, isValidEmail } from "@/lib/reservas";

type Environment = { id: string; name: string; capacity: number };

type DayStatus = "fechado" | "bloqueado" | "fora-do-prazo" | "sem-horario" | "disponivel";
type DayAvailability = { dateKey: string; status: DayStatus; isSpecialGroup?: boolean };

type AvailabilitySlot = {
  time: string;
  startTime: string;
  endTime: string;
  withinAdvanceWindow: boolean;
  available: boolean;
};
type DayDetail =
  | { open: false; reason: "bloqueado" | "fechado" | "fora-do-prazo"; blockedReason?: string | null }
  | {
      open: true;
      openTime: string;
      closeTime: string;
      isSpecialGroup: boolean;
      slots: AvailabilitySlot[];
      // `AvailabilityResult` (src/lib/reservas-disponibilidade.ts) já devolve `settings` (as
      // configurações de Reservas da loja) quando `open: true` — só o campo usado aqui
      // (`lateToleranceMinutes`) é tipado, para montar o texto das regras da casa na etapa de
      // confirmação (tarefa "reservas-termos-aceite") com o valor real configurado pela loja, em
      // vez de um número fixo no texto.
      settings: { lateToleranceMinutes: number };
    };

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
  // Caixinha de aceite das regras da casa (tarefa "reservas-termos-aceite") — obrigatória para
  // enviar a solicitação, mesmo padrão de validação do e-mail abaixo (ver `confirmarReserva`).
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Achado #163 (revisão geral, Nina): o status vem da API (`POST .../reservas`) e decide a
  // mensagem exibida no passo "confirmacao" abaixo — o fluxo público sempre cria a reserva como
  // PENDENTE (aguardando confirmação da loja), nunca já CONFIRMADA.
  const [confirmation, setConfirmation] = useState<{ confirmationCode: string; status: string } | null>(null);

  const selectedEnvironment = environments.find((e) => e.id === environmentId) ?? null;
  // Tempo de tolerância configurado pela loja (`ReservationSettings.lateToleranceMinutes`,
  // configurável em Reservas > Configurações) — vem junto da própria consulta de disponibilidade
  // do dia (`dayDetail.settings`), sem precisar de uma chamada nova. Só fica disponível depois que
  // o cliente escolhe dia/horário (etapa "formulario"); na prática, ao chegar na etapa "dados" o
  // dia selecionado sempre tem `dayDetail.open === true` (o botão de horário só aparece quando
  // `dayDetail?.open`), mas o fallback abaixo evita um texto com valor indefinido em qualquer
  // race condition.
  const lateToleranceMinutes = dayDetail?.open ? dayDetail.settings.lateToleranceMinutes : null;

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
    // E-mail virou obrigatório (ver tarefa "reservas-unificar-calendario", item #4) — é o canal
    // usado pra avisar se a reserva foi aceita ou recusada (ver item #5), então sem ele a loja
    // não teria como notificar de volta.
    const emailTrimmed = email.trim();
    if (!emailTrimmed) return setError("Informe seu e-mail.");
    if (!isValidEmail(emailTrimmed)) return setError("Informe um e-mail válido.");
    // Caixinha de aceite das regras da casa (tarefa "reservas-termos-aceite") — obrigatória para
    // enviar, mesmo padrão dos outros campos obrigatórios acima. Validado de novo no servidor
    // (`POST .../reservas`, campo `termsAccepted`) — nunca confiar só na validação do cliente.
    if (!termsAccepted) return setError("Marque que você leu e aceita as regras da casa para confirmar a reserva.");
    if (submitting) return;
    setSubmitting(true);
    const res = await apiRequest<{ reservation: { confirmationCode: string; status: string } }>(`/api/reservar/${empresaKey}/reservas`, "POST", {
      ambienteId: environmentId,
      data: selectedDateKey,
      horario: selectedTime,
      pessoas: partySize,
      nome: nome.trim(),
      telefone: telefoneDigits,
      email: emailTrimmed,
      termsAccepted,
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
    setConfirmation({ confirmationCode: res.data.reservation.confirmationCode, status: res.data.reservation.status });
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
    setTermsAccepted(false);
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
        <span className="text-nord-gray text-xs ml-auto">Fazer reserva</span>
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
                // Tarefa #154: o campo já vem preenchido com um valor padrão (2) — sem isso, ao
                // clicar e digitar o número desejado (ex. "8"), o cursor ia pro FINAL do valor
                // existente em vez de selecioná-lo, e o resultado virava "28" em vez de "8"
                // (achado reportado pelo Matheus). Selecionar tudo ao focar faz qualquer dígito
                // novo substituir o valor inteiro.
                onFocus={(e) => e.target.select()}
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
            <span className="block text-xs text-nord-gray mb-1">E-mail</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="seuemail@exemplo.com"
            />
          </label>

          <div className="bg-nord-panel border border-nord-border rounded-2xl p-3 text-xs text-nord-gray space-y-2">
            <p className="text-white text-sm font-semibold">Regras da casa</p>
            <ol className="list-decimal list-outside pl-4 space-y-1.5">
              <li>
                Após {lateToleranceMinutes != null ? `os ${lateToleranceMinutes} minutos de tolerância` : "o tempo de tolerância"}
                , se nem todos os convidados tiverem chegado, a equipe pode retirar as mesas que estiverem sobrando, caso seja
                necessário.
              </li>
              <li>Não é permitido colar nenhum tipo de decoração nas paredes.</li>
            </ol>
            <label className="flex items-start gap-2 pt-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 shrink-0 rounded border-nord-border accent-nord-blue"
              />
              <span className="text-white">Li e aceito as regras da casa.</span>
            </label>
          </div>

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
          {confirmation.status === "CONFIRMADA" ? (
            <div>
              <p className="text-white text-lg font-semibold">Reserva confirmada!</p>
              <p className="text-nord-gray text-sm mt-1">Te esperamos no horário combinado.</p>
            </div>
          ) : (
            <div>
              <p className="text-white text-lg font-semibold">Recebemos sua solicitação de reserva!</p>
              <p className="text-nord-gray text-sm mt-1">
                Em breve você vai receber um e-mail confirmando se a reserva foi aprovada.
              </p>
            </div>
          )}
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
