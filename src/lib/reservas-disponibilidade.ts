import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { ReservationStatus } from "@prisma/client";
import { spDateKey, spStartOfDay } from "@/lib/timezone";
import { spDateTime, spWeekday } from "@/lib/checklist";
import { p2002ConstraintIncludes } from "@/lib/prisma-errors";

/**
 * Motor de disponibilidade de Reservas (Etapa 2) — ver prompt da tarefa "reservas-etapa2" (seção
 * 10 do documento original) e o bloco de comentário no `prisma/schema.prisma` acima de
 * `model ReservationEnvironment` para o racional de modelagem de Ambiente/Reserva. Funciona por
 * INTERVALO de horário (não soma diária): uma ocupação das 18h às 19h30 volta a liberar
 * capacidade depois, respeitando `cleaningMinutes` (tempo de limpeza) configurado em
 * `ReservationSettings`.
 *
 * Reaproveita os helpers de fuso horário já existentes no projeto: `parseDateKey`/`spStartOfDay`
 * (src/lib/timezone.ts) e `spDateTime`/`spWeekday` (src/lib/checklist.ts, que já combina
 * "YYYY-MM-DD" + "HH:mm" em instante de São Paulo e calcula o dia da semana na mesma convenção
 * de `ReservationWeekdayHours.dayOfWeek` — 0 = domingo ... 6 = sábado) em vez de reinventar
 * conversão de fuso horário aqui.
 *
 * Etapa 3 (página pública `/reservar/[empresaKey]`) acrescentou `getMonthAvailability` (resumo de
 * disponibilidade por dia, para o calendário) e os campos de contato/código curto de confirmação
 * em `reserveEnvironmentTransacted`.
 *
 * REDESIGN (tarefa "reservas-remover-mesas", posterior à Etapa 2/3/4): o motor deixou de
 * controlar mesa/combinação de mesas específica — ver comentário no topo do bloco "RESERVAS —
 * Etapa 2" do `prisma/schema.prisma`. A partir desta tarefa, disponibilidade = CAPACIDADE
 * AGREGADA do ambiente: soma o `partySize` de todas as reservas que ocupam o ambiente num
 * intervalo de horário e compara com `ReservationEnvironment.capacity`. Nenhuma reserva fica
 * atrelada a mesa nenhuma — `reserveTablesTransacted` foi renomeada para
 * `reserveEnvironmentTransacted` e não recebe mais `tableIds`.
 */

/** Status de reserva que ainda OCUPA capacidade do ambiente (conta para a soma de ocupação).
 * Finalizada, Cancelada e Não compareceu liberam a capacidade — uma reserva finalizada já
 * terminou de verdade (não precisa aguardar o fim do intervalo original), e as outras duas nunca
 * ocuparam capacidade de fato. Regras automáticas de transição entre status (ex.: liberar após o
 * fim da tolerância de atraso) são de etapa futura (dashboard operacional) — aqui só consultamos
 * o status já gravado. */
export const RESERVATION_OCCUPYING_STATUSES: ReservationStatus[] = [
  "PENDENTE",
  "CONFIRMADA",
  "CLIENTE_CHEGOU",
  "ACOMODADO",
];

export type ReservationSettingsValues = {
  durationMinutes: number;
  cleaningMinutes: number;
  lateToleranceMinutes: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  specialGroupThreshold: number;
  slotIntervalMinutes: number;
};

/** Fallback só para quando a loja nunca abriu a tela de Configurações de Reservas (sem
 * `ReservationSettings` gravado ainda) — mesmos valores default do schema (fonte da verdade);
 * duplicados aqui de propósito para o motor funcionar mesmo sem nenhuma configuração prévia. */
export const DEFAULT_RESERVATION_SETTINGS: ReservationSettingsValues = {
  durationMinutes: 90,
  cleaningMinutes: 15,
  lateToleranceMinutes: 15,
  minAdvanceMinutes: 60,
  maxAdvanceDays: 60,
  specialGroupThreshold: 10,
  slotIntervalMinutes: 30,
};

export class ReservationConflictError extends Error {
  constructor(message = "Este ambiente não tem mais capacidade livre nesse horário.") {
    super(message);
    this.name = "ReservationConflictError";
  }
}

export class ReservationBusyError extends Error {
  constructor() {
    super("Já existe outra reserva sendo criada para este ambiente no momento — tente de novo em instantes.");
    this.name = "ReservationBusyError";
  }
}

/** Esgotamento real das `CONFIRMATION_CODE_MAX_ATTEMPTS` tentativas de gerar um código curto de
 * confirmação sem colisão (ver `CONFIRMATION_CODE_ALPHABET` — praticamente impossível com 32^6
 * combinações, mas ainda um caso de erro genuíno do código, não um erro "inesperado" de
 * infraestrutura). Achado do Teulis na revisão da Etapa 3: antes desse erro específico existir,
 * esse caso virava um 500 genérico na rota — semanticamente deveria ser um 503 (serviço/recurso
 * temporariamente esgotado), já que é razoável esperar que tentar de novo mais tarde funcione. */
export class ReservationCodeExhaustedError extends Error {
  constructor() {
    super("Não foi possível gerar um código de confirmação único após várias tentativas.");
    this.name = "ReservationCodeExhaustedError";
  }
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Horários de início possíveis dentro do expediente, respeitando a duração da reserva (o
 * horário final sempre precisa caber antes do fechamento) e o intervalo entre horários
 * configurado (`slotIntervalMinutes`). */
function generateSlotStarts(openTime: string, closeTime: string, slotIntervalMinutes: number, durationMinutes: number): string[] {
  const open = timeToMinutes(openTime);
  const close = timeToMinutes(closeTime);
  const slots: string[] = [];
  for (let t = open; t + durationMinutes <= close; t += Math.max(slotIntervalMinutes, 1)) {
    slots.push(minutesToTime(t));
  }
  return slots;
}

function addDaysToDateKey(dateKey: string, delta: number): string {
  const d = spStartOfDay(dateKey);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

async function getReservationSettings(empresaId: string): Promise<ReservationSettingsValues> {
  const settings = await prisma.reservationSettings.findUnique({ where: { empresaId } });
  if (!settings) return DEFAULT_RESERVATION_SETTINGS;
  return {
    durationMinutes: settings.durationMinutes,
    cleaningMinutes: settings.cleaningMinutes,
    lateToleranceMinutes: settings.lateToleranceMinutes,
    minAdvanceMinutes: settings.minAdvanceMinutes,
    maxAdvanceDays: settings.maxAdvanceDays,
    specialGroupThreshold: settings.specialGroupThreshold,
    slotIntervalMinutes: settings.slotIntervalMinutes,
  };
}

type OccupyingReservation = { start: Date; end: Date; partySize: number };

/** Busca as reservas que podem colidir com QUALQUER horário do dia pedido, já somando o tempo de
 * limpeza ao fim de cada uma — janela de 1 dia antes até 1 dia depois do `dateKey` para cobrir o
 * caso raro de uma reserva do dia anterior (ex. 23h + limpeza) invadir a madrugada, ou uma
 * reserva deste dia ultrapassar a meia-noite. */
async function getOccupyingReservations(environmentId: string, dateKey: string, cleaningMinutes: number): Promise<OccupyingReservation[]> {
  const from = spStartOfDay(addDaysToDateKey(dateKey, -1));
  const to = spStartOfDay(addDaysToDateKey(dateKey, 2));
  const reservations = await prisma.reservation.findMany({
    where: {
      environmentId,
      status: { in: RESERVATION_OCCUPYING_STATUSES },
      date: { gte: from, lt: to },
    },
    select: { startTime: true, endTime: true, partySize: true },
  });
  const cleaningMs = cleaningMinutes * 60 * 1000;
  return reservations.map((r) => ({
    start: r.startTime,
    end: new Date(r.endTime.getTime() + cleaningMs),
    partySize: r.partySize,
  }));
}

/** Soma de `partySize` de todas as reservas de `occupying` que colidem com o intervalo
 * [`slotStart`, `slotEnd`). */
function occupiedCapacityFor(slotStart: Date, slotEnd: Date, occupying: OccupyingReservation[]): number {
  return occupying.reduce((sum, o) => (o.start < slotEnd && o.end > slotStart ? sum + o.partySize : sum), 0);
}

export type AvailabilitySlot = {
  time: string;
  startTime: string;
  endTime: string;
  /** Passa a regra de antecedência mínima/máxima (`minAdvanceMinutes`/`maxAdvanceDays`) — um
   * horário pode ter capacidade livre e ainda assim não ser oferecido por estar fora da janela de
   * antecedência permitida. */
  withinAdvanceWindow: boolean;
  /** Pessoas já reservadas neste ambiente que ocupam este intervalo de horário (ver
   * `RESERVATION_OCCUPYING_STATUSES`/`cleaningMinutes`). */
  occupiedCapacity: number;
  /** Capacidade total do ambiente (`ReservationEnvironment.capacity`) — repetida em cada slot por
   * conveniência do consumidor (evita precisar ler de outro lugar). */
  totalCapacity: number;
  /** `totalCapacity - occupiedCapacity`, nunca negativa (pode ficar 0 quando já esgotada). */
  freeCapacity: number;
  /** Cabe o `partySize` pedido (`occupiedCapacity + partySize <= totalCapacity`) E o horário está
   * dentro da janela de antecedência. */
  available: boolean;
};

export type AvailabilityResult =
  | { open: false; reason: "bloqueado" | "fechado" | "fora-do-prazo"; blockedReason?: string | null }
  | {
      open: true;
      openTime: string;
      closeTime: string;
      settings: ReservationSettingsValues;
      isSpecialGroup: boolean;
      slots: AvailabilitySlot[];
    };

/**
 * Calcula a disponibilidade de um ambiente num dia (grade inteira, ou um único horário
 * específico se `time` for informado). Assume `dateKey` ("YYYY-MM-DD") e `partySize` já
 * validados pelo chamador (ver `GET /api/reservas/disponibilidade`).
 */
export async function getAvailability(params: {
  empresaId: string;
  environmentId: string;
  dateKey: string;
  partySize: number;
  time?: string;
}): Promise<AvailabilityResult> {
  const { empresaId, environmentId, dateKey, partySize, time } = params;

  const environment = await prisma.reservationEnvironment.findFirst({
    where: { id: environmentId, empresaId, active: true },
    select: { id: true, capacity: true },
  });
  if (!environment) {
    return { open: false, reason: "fechado" };
  }

  const settings = await getReservationSettings(empresaId);

  const blocked = await prisma.reservationBlockedDate.findUnique({
    where: { empresaId_date: { empresaId, date: spStartOfDay(dateKey) } },
  });
  if (blocked) {
    return { open: false, reason: "bloqueado", blockedReason: blocked.reason };
  }

  const today = spDateKey();
  const daysFromToday = Math.round((spStartOfDay(dateKey).getTime() - spStartOfDay(today).getTime()) / 86400000);
  if (daysFromToday < 0 || daysFromToday > settings.maxAdvanceDays) {
    return { open: false, reason: "fora-do-prazo" };
  }

  const weekday = spWeekday(dateKey);
  const settingsRow = await prisma.reservationSettings.findUnique({
    where: { empresaId },
    include: { weekdayHours: { where: { dayOfWeek: weekday } } },
  });
  const weekdayHours = settingsRow?.weekdayHours[0];
  if (!weekdayHours || !weekdayHours.open) {
    return { open: false, reason: "fechado" };
  }

  const slotTimes = time
    ? [time]
    : generateSlotStarts(weekdayHours.openTime, weekdayHours.closeTime, settings.slotIntervalMinutes, settings.durationMinutes);

  const occupying = await getOccupyingReservations(environmentId, dateKey, settings.cleaningMinutes);
  const now = new Date();
  const minAdvanceMs = settings.minAdvanceMinutes * 60 * 1000;
  const openMinutes = timeToMinutes(weekdayHours.openTime);
  const closeMinutes = timeToMinutes(weekdayHours.closeTime);

  const slots: AvailabilitySlot[] = slotTimes.map((hhmm) => {
    const startTime = spDateTime(dateKey, hhmm);
    const endTime = new Date(startTime.getTime() + settings.durationMinutes * 60 * 1000);
    const slotMinutes = timeToMinutes(hhmm);
    const withinOperatingHours = slotMinutes >= openMinutes && slotMinutes + settings.durationMinutes <= closeMinutes;
    const withinAdvanceWindow = withinOperatingHours && startTime.getTime() - now.getTime() >= minAdvanceMs;

    const occupiedCapacity = occupiedCapacityFor(startTime, endTime, occupying);
    const freeCapacity = Math.max(0, environment.capacity - occupiedCapacity);

    return {
      time: hhmm,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      withinAdvanceWindow,
      occupiedCapacity,
      totalCapacity: environment.capacity,
      freeCapacity,
      available: withinAdvanceWindow && occupiedCapacity + partySize <= environment.capacity,
    };
  });

  return {
    open: true,
    openTime: weekdayHours.openTime,
    closeTime: weekdayHours.closeTime,
    settings,
    isSpecialGroup: partySize > settings.specialGroupThreshold,
    slots,
  };
}

export type DayAvailabilityStatus = "fechado" | "bloqueado" | "fora-do-prazo" | "sem-horario" | "disponivel";

export type DayAvailability = {
  dateKey: string;
  status: DayAvailabilityStatus;
  /** Só presente quando `status` é "sem-horario" ou "disponivel" (dia aberto) — mesmo campo de
   * `AvailabilityResult.isSpecialGroup`, repassado pra o calendário poder sinalizar visualmente
   * que aquele `partySize` é um grupo especial (ver `ReservationSettings.specialGroupThreshold`;
   * o processo diferenciado em si continua fora de escopo, só o aviso visual). */
  isSpecialGroup?: boolean;
};

/**
 * Resumo de disponibilidade de um MÊS inteiro (um status por dia, não a grade de horários) — usado
 * pelo calendário da página pública (Etapa 3, `/reservar/[empresaKey]`) para colorir cada dia sem
 * precisar que o cliente abra um por um. Reaproveita `getAvailability` dia a dia (nenhuma lógica de
 * disponibilidade duplicada aqui) — ver `src/app/api/reservar/[empresaKey]/disponibilidade/route.ts`.
 *
 * Custo: um dia fechado/bloqueado/fora-do-prazo sai barato (`getAvailability` retorna cedo, antes
 * de consultar a ocupação do ambiente); só dias efetivamente abertos E dentro da janela de
 * antecedência pagam o custo completo da consulta. Para uma loja com `maxAdvanceDays` grande e
 * tráfego alto, isso pode virar um ponto de otimização futura (ex.: uma versão que busca a
 * ocupação do mês inteiro de uma vez e itera em memória) — não feito nesta etapa por não ser
 * necessário para o volume esperado de uma reserva de restaurante.
 */
export async function getMonthAvailability(params: {
  empresaId: string;
  environmentId: string;
  partySize: number;
  /** Ano cheio (ex.: 2026). */
  year: number;
  /** Mês 1-12 (NÃO 0-based — diferente do `Date` nativo do JS). */
  month: number;
}): Promise<{ days: DayAvailability[] }> {
  const { empresaId, environmentId, partySize, year, month } = params;
  const daysInMonth = new Date(year, month, 0).getDate();

  const days: DayAvailability[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const result = await getAvailability({ empresaId, environmentId, dateKey, partySize });
    if (!result.open) {
      days.push({ dateKey, status: result.reason });
      continue;
    }
    const hasAvailableSlot = result.slots.some((s) => s.available);
    days.push({ dateKey, status: hasAvailableSlot ? "disponivel" : "sem-horario", isSpecialGroup: result.isSpecialGroup });
  }
  return { days };
}

/** Alfabeto do código curto de confirmação (`Reservation.confirmationCode`) sem caracteres
 * ambíguos por telefone/e-mail: sem `0`/`O`, sem `1`/`I`. 32 símbolos, 6 caracteres = 32^6 (~1
 * bilhão) combinações — colisão é rara o bastante para resolver só com um retry simples em vez de
 * um contador atômico sequencial (padrão mais pesado, usado por `FeedbackProtocolCounter` para um
 * formato tipo "BUG-000105" — não necessário aqui). */
const CONFIRMATION_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CONFIRMATION_CODE_LENGTH = 6;
const CONFIRMATION_CODE_MAX_ATTEMPTS = 8;

function generateConfirmationCode(): string {
  let code = "";
  for (let i = 0; i < CONFIRMATION_CODE_LENGTH; i++) {
    code += CONFIRMATION_CODE_ALPHABET[Math.floor(Math.random() * CONFIRMATION_CODE_ALPHABET.length)];
  }
  return code;
}

function isConfirmationCodeConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && (p2002ConstraintIncludes(e, "confirmationCode") ?? true);
}

/**
 * Cria uma reserva de forma segura contra concorrência — motor interno consumido pela página
 * pública da Etapa 3 (`POST /api/reservar/[empresaKey]/reservas`, ver `src/lib/reservas-publico.ts`)
 * e pela criação manual (`POST /api/reservas/reservas`). Mesmo padrão de `pg_try_advisory_xact_lock`
 * já usado em `syncBankTransactions` (src/lib/bank-sync-server.ts): trava por ATRIBUIÇÃO DE
 * RECURSO (aqui, o ambiente inteiro) dentro de uma transação, revalida a capacidade agregada
 * DEPOIS de obter a trava (a consulta de disponibilidade feita antes de chamar esta função pode
 * estar desatualizada no instante em que duas requisições concorrentes chegam aqui) e só então
 * grava a reserva — sem nenhuma mesa atribuída (ver comentário de redesign no topo do arquivo).
 */
type ReserveEnvironmentTransactedBaseParams = {
  empresaId: string;
  environmentId: string;
  dateKey: string;
  startTime: Date;
  endTime: Date;
  partySize: number;
  clienteId?: string | null;
  cleaningMinutes: number;
  /** Contato de quem fez a reserva (Etapa 3) — ver comentário em `Reservation.customerName` no
   * schema. Sempre informados pelo fluxo público; opcionais aqui só para não travar uma eventual
   * chamada futura (fora de escopo desta etapa) que não tenha esse contato em mãos. */
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  /** Status inicial da reserva — default `PENDENTE` (fluxo público, Etapa 3: o cliente só está
   * pedindo, a loja ainda confirma depois). `POST /api/reservas/reservas` (Etapa 4 — criação
   * manual pelo funcionário) passa `CONFIRMADA` explicitamente: quando é a própria loja que está
   * atendendo o telefone e cadastrando a reserva na hora, não existe o mesmo "aguardando
   * confirmação" do fluxo público — ela já nasce confirmada. */
  status?: ReservationStatus;
};

/**
 * Overload sem `include` (fluxo público, `POST /api/reservar/[empresaKey]/reservas`): devolve só
 * `{ id, confirmationCode }`, igual sempre devolveu — esse consumidor nunca precisou das relações.
 */
export async function reserveEnvironmentTransacted(
  params: ReserveEnvironmentTransactedBaseParams & { include?: undefined },
): Promise<{ id: string; confirmationCode: string }>;
/**
 * Overload com `include` (criação manual, `POST /api/reservas/reservas`, Etapa 4 — achado do
 * Teulis, tarefa #147): devolve a entidade já com as relações pedidas carregadas, lidas de dentro
 * da própria transação de criação — evita o `findUnique` extra que a rota fazia depois de chamar
 * esta função só para buscar as relações e serializar a resposta.
 */
export async function reserveEnvironmentTransacted<Include extends Prisma.ReservationInclude>(
  params: ReserveEnvironmentTransactedBaseParams & { include: Include },
): Promise<Prisma.ReservationGetPayload<{ include: Include }>>;
export async function reserveEnvironmentTransacted(
  params: ReserveEnvironmentTransactedBaseParams & { include?: Prisma.ReservationInclude },
): Promise<{ id: string; confirmationCode: string } | Prisma.ReservationGetPayload<{ include: Prisma.ReservationInclude }>> {
  const {
    empresaId,
    environmentId,
    dateKey,
    startTime,
    endTime,
    partySize,
    clienteId,
    cleaningMinutes,
    customerName,
    customerPhone,
    customerEmail,
    status = "PENDENTE",
    include,
  } = params;

  // Retry da TRANSAÇÃO INTEIRA em caso de colisão do código curto (ver `isConfirmationCodeConflict`
  // e o comentário do alfabeto acima) — nunca só da query de `create` dentro da MESMA transação já
  // aberta: depois que uma query de uma transação Postgres falha com um erro real de constraint
  // (`23505`), a transação inteira entra em estado "abortado" e qualquer query seguinte nela falha
  // com `25P02`/P2039 ("current transaction is aborted"), inclusive um novo `tx.reservation.create`
  // com um código diferente — achado do Teulis na revisão desta etapa, reproduzido ao vivo (a
  // versão anterior deste código tentava de novo dentro da mesma transação e vazava um 500 cru já
  // na 2ª tentativa). Refazer a transação do zero a cada colisão também já revalida o lock/conflito
  // de novo, o que é correto (e não TEM que ser barato: colisão de 6 caracteres sem caracteres
  // ambíguos é rara, ver `CONFIRMATION_CODE_ALPHABET`).
  for (let attempt = 1; attempt <= CONFIRMATION_CODE_MAX_ATTEMPTS; attempt++) {
    const confirmationCode = generateConfirmationCode();
    try {
      return await prisma.$transaction(async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${`reservas-ambiente:${environmentId}`}, 0)) AS locked
        `;
        if (!locked) throw new ReservationBusyError();

        // Revalida a capacidade agregada DENTRO da trava — a consulta de disponibilidade usada
        // para decidir que este horário cabia pode ter ficado desatualizada entre o momento em
        // que foi feita e agora (ex.: outra reserva concorrente acabou de ocupar parte da
        // capacidade deste ambiente).
        const environment = await tx.reservationEnvironment.findUnique({
          where: { id: environmentId },
          select: { capacity: true },
        });
        if (!environment) throw new Error("Ambiente não encontrado.");

        const cleaningMs = cleaningMinutes * 60 * 1000;
        const from = spStartOfDay(addDaysToDateKey(dateKey, -1));
        const to = spStartOfDay(addDaysToDateKey(dateKey, 2));
        const candidates = await tx.reservation.findMany({
          where: {
            environmentId,
            status: { in: RESERVATION_OCCUPYING_STATUSES },
            date: { gte: from, lt: to },
          },
          select: { startTime: true, endTime: true, partySize: true },
        });
        const occupiedCapacity = candidates.reduce((sum, r) => {
          const occupiedEnd = new Date(r.endTime.getTime() + cleaningMs);
          const overlaps = r.startTime < endTime && occupiedEnd > startTime;
          return overlaps ? sum + r.partySize : sum;
        }, 0);
        if (occupiedCapacity + partySize > environment.capacity) throw new ReservationConflictError();

        const data = {
          empresaId,
          environmentId,
          clienteId: clienteId ?? null,
          confirmationCode,
          customerName: customerName ?? null,
          customerPhone: customerPhone ?? null,
          customerEmail: customerEmail ?? null,
          date: spStartOfDay(dateKey),
          startTime,
          endTime,
          partySize,
          status,
        };
        // Com `include`, pede pro próprio `create` já devolver as relações pedidas — mesma
        // query de escrita, sem round-trip extra (`findUnique` depois) pro chamador montar a
        // resposta. Sem `include`, mantém o retorno mínimo de sempre.
        if (include) {
          return await tx.reservation.create({ data, include });
        }
        const reservation = await tx.reservation.create({ data });
        return { id: reservation.id, confirmationCode: reservation.confirmationCode };
      });
    } catch (err) {
      if (!isConfirmationCodeConflict(err)) throw err;
      // Esgotou as tentativas de verdade (todas colidiram) — erro semântico específico (503 na
      // rota), não o erro cru do Prisma (P2002) nem um 500 genérico.
      if (attempt === CONFIRMATION_CODE_MAX_ATTEMPTS) throw new ReservationCodeExhaustedError();
      // Colisão de código: a transação inteira já foi revertida pelo Prisma (nenhuma capacidade
      // foi "gasta") — tenta de novo do zero, com um código novo, no próximo giro do loop.
    }
  }
  // Inalcançável (o loop acima sempre retorna ou relança no último attempt) — só para o TypeScript
  // entender que a função nunca "cai pro fim" sem devolver nada.
  throw new ReservationCodeExhaustedError();
}
