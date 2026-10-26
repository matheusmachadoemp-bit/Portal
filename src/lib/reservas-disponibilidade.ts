import { prisma } from "@/lib/prisma";
import type { ReservationStatus } from "@prisma/client";
import { spDateKey, spStartOfDay } from "@/lib/timezone";
import { spDateTime, spWeekday } from "@/lib/checklist";

/**
 * Motor de disponibilidade de Reservas (Etapa 2) — ver prompt da tarefa "reservas-etapa2" (seção
 * 10 do documento original) e o bloco de comentário no `prisma/schema.prisma` acima de
 * `model ReservationEnvironment` para o racional de modelagem de Mesa/Ambiente/Combinação/
 * Reserva. Funciona por INTERVALO de horário (não soma diária): uma mesa ocupada das 18h às
 * 19h30 volta a ficar livre depois, respeitando `cleaningMinutes` (tempo de limpeza) configurado
 * em `ReservationSettings`.
 *
 * Reaproveita os helpers de fuso horário já existentes no projeto: `parseDateKey`/`spStartOfDay`
 * (src/lib/timezone.ts) e `spDateTime`/`spWeekday` (src/lib/checklist.ts, que já combina
 * "YYYY-MM-DD" + "HH:mm" em instante de São Paulo e calcula o dia da semana na mesma convenção
 * de `ReservationWeekdayHours.dayOfWeek` — 0 = domingo ... 6 = sábado) em vez de reinventar
 * conversão de fuso horário aqui.
 */

/** Status de reserva que ainda OCUPA uma mesa (conta para conflito de horário). Finalizada,
 * Cancelada e Não compareceu liberam a mesa — uma reserva finalizada já terminou de verdade
 * (não precisa aguardar o fim do intervalo original), e as outras duas nunca ocuparam a mesa de
 * fato. Regras automáticas de transição entre status (ex.: liberar após o fim da tolerância de
 * atraso) são de etapa futura (dashboard operacional) — aqui só consultamos o status já gravado. */
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
  constructor(message = "Uma ou mais mesas selecionadas já estão ocupadas nesse horário.") {
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

type TableForEngine = {
  id: string;
  identificacao: string;
  capacityMin: number;
  capacityMax: number;
};

type CombinationForEngine = {
  id: string;
  name: string | null;
  tableIds: string[];
};

/** Mesas da loja que podem ser oferecidas em reservas (ambiente ativo, mesa com status
 * operacional DISPONIVEL e `availableForReservation` true) — mesas em manutenção/inativas, ou
 * temporariamente fora da oferta de reservas, nunca aparecem aqui. */
async function getBookableTables(environmentId: string): Promise<TableForEngine[]> {
  const tables = await prisma.reservationTable.findMany({
    where: { environmentId, status: "DISPONIVEL", availableForReservation: true },
    orderBy: { order: "asc" },
    select: { id: true, identificacao: true, capacityMin: true, capacityMax: true },
  });
  return tables;
}

async function getActiveCombinations(empresaId: string, tableIds: Set<string>): Promise<CombinationForEngine[]> {
  if (tableIds.size === 0) return [];
  const combinations = await prisma.reservationTableCombination.findMany({
    where: { empresaId, active: true },
    include: { members: { select: { tableId: true } } },
  });
  // Só combinações cujas mesas-membro TODAS pertencem a este ambiente (uma combinação pode, em
  // tese, ter sido cadastrada com mesas de ambientes diferentes se o ambiente de uma mesa mudar
  // depois — a tela de cadastro não deixa misturar ambientes na criação, mas isso é uma segunda
  // garantia defensiva aqui no motor).
  return combinations
    .map((c) => ({ id: c.id, name: c.name, tableIds: c.members.map((m) => m.tableId) }))
    .filter((c) => c.tableIds.length > 0 && c.tableIds.every((id) => tableIds.has(id)));
}

type OccupiedInterval = { tableId: string; start: Date; end: Date };

/** Busca as reservas (com mesas atribuídas) que podem colidir com QUALQUER horário do dia
 * pedido, já somando o tempo de limpeza ao fim de cada uma — janela de 1 dia antes até 1 dia
 * depois do `dateKey` para cobrir o caso raro de uma reserva do dia anterior (ex. 23h + limpeza)
 * invadir a madrugada, ou uma reserva deste dia ultrapassar a meia-noite. */
async function getOccupiedIntervals(environmentId: string, dateKey: string, cleaningMinutes: number): Promise<OccupiedInterval[]> {
  const from = spStartOfDay(addDaysToDateKey(dateKey, -1));
  const to = spStartOfDay(addDaysToDateKey(dateKey, 2));
  const reservations = await prisma.reservation.findMany({
    where: {
      environmentId,
      status: { in: RESERVATION_OCCUPYING_STATUSES },
      date: { gte: from, lt: to },
    },
    select: { startTime: true, endTime: true, tables: { select: { tableId: true } } },
  });
  const cleaningMs = cleaningMinutes * 60 * 1000;
  const intervals: OccupiedInterval[] = [];
  for (const r of reservations) {
    const end = new Date(r.endTime.getTime() + cleaningMs);
    for (const { tableId } of r.tables) {
      intervals.push({ tableId, start: r.startTime, end });
    }
  }
  return intervals;
}

function isTableFree(tableId: string, slotStart: Date, slotEnd: Date, occupied: OccupiedInterval[]): boolean {
  return !occupied.some((o) => o.tableId === tableId && o.start < slotEnd && o.end > slotStart);
}

export type AvailabilityOption = {
  /** "mesa": uma única mesa cobre o grupo. "combinacao": uma combinação pré-cadastrada de mesas
   * (ver `ReservationTableCombination`) cobre o grupo — capacidade computada em código a partir
   * da soma das mesas-membro (ver comentário de modelagem no schema). */
  type: "mesa" | "combinacao";
  id: string;
  label: string;
  tableIds: string[];
  capacityMin: number;
  capacityMax: number;
};

export type AvailabilitySlot = {
  time: string;
  startTime: string;
  endTime: string;
  /** Passa a regra de antecedência mínima/máxima (`minAdvanceMinutes`/`maxAdvanceDays`) — um
   * horário pode ter mesa livre e ainda assim não ser oferecido por estar fora da janela de
   * antecedência permitida. */
  withinAdvanceWindow: boolean;
  freeTables: number;
  freeCapacity: number;
  /** Há pelo menos uma opção (mesa única ou combinação) que comporta `partySize` E o horário
   * está dentro da janela de antecedência. */
  available: boolean;
  options: AvailabilityOption[];
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
    select: { id: true },
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

  const tables = await getBookableTables(environmentId);
  const tableIds = new Set(tables.map((t) => t.id));
  const combinations = await getActiveCombinations(empresaId, tableIds);
  const occupied = await getOccupiedIntervals(environmentId, dateKey, settings.cleaningMinutes);
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

    const freeTableList = tables.filter((t) => isTableFree(t.id, startTime, endTime, occupied));
    const freeIds = new Set(freeTableList.map((t) => t.id));

    const options: AvailabilityOption[] = [];
    for (const t of freeTableList) {
      if (partySize >= t.capacityMin && partySize <= t.capacityMax) {
        options.push({ type: "mesa", id: t.id, label: t.identificacao, tableIds: [t.id], capacityMin: t.capacityMin, capacityMax: t.capacityMax });
      }
    }
    for (const c of combinations) {
      if (!c.tableIds.every((id) => freeIds.has(id))) continue;
      const members = c.tableIds.map((id) => tables.find((t) => t.id === id)!).filter(Boolean);
      const capacityMin = members.reduce((sum, m) => sum + m.capacityMin, 0);
      const capacityMax = members.reduce((sum, m) => sum + m.capacityMax, 0);
      if (partySize >= capacityMin && partySize <= capacityMax) {
        options.push({
          type: "combinacao",
          id: c.id,
          label: c.name ?? members.map((m) => m.identificacao).join(" + "),
          tableIds: c.tableIds,
          capacityMin,
          capacityMax,
        });
      }
    }

    return {
      time: hhmm,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      withinAdvanceWindow,
      freeTables: freeTableList.length,
      freeCapacity: freeTableList.reduce((sum, t) => sum + t.capacityMax, 0),
      available: withinAdvanceWindow && options.length > 0,
      options,
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

/**
 * Cria uma reserva de forma segura contra concorrência — base para a Etapa 4 (fluxo de
 * confirmação de reserva), sem UI própria ainda nesta etapa. Mesmo padrão de
 * `pg_try_advisory_xact_lock` já usado em `syncBankTransactions` (src/lib/bank-sync-server.ts):
 * trava por ATRIBUIÇÃO DE RECURSO (aqui, o ambiente inteiro — todas as mesas de um ambiente
 * compartilham a mesma trava, já que uma combinação pode envolver qualquer mesa dele) dentro de
 * uma transação, revalida o conflito DEPOIS de obter a trava (a consulta de disponibilidade feita
 * antes de chamar esta função pode estar desatualizada no instante em que duas requisições
 * concorrentes chegam aqui) e só então grava a reserva + as atribuições de mesa.
 */
export async function reserveTablesTransacted(params: {
  empresaId: string;
  environmentId: string;
  tableIds: string[];
  dateKey: string;
  startTime: Date;
  endTime: Date;
  partySize: number;
  clienteId?: string | null;
  cleaningMinutes: number;
}): Promise<{ id: string }> {
  const { empresaId, environmentId, tableIds, dateKey, startTime, endTime, partySize, clienteId, cleaningMinutes } = params;
  if (tableIds.length === 0) throw new Error("Informe ao menos uma mesa.");

  return prisma.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${`reservas-ambiente:${environmentId}`}, 0)) AS locked
    `;
    if (!locked) throw new ReservationBusyError();

    // Revalida o conflito DENTRO da trava — a consulta de disponibilidade usada para decidir
    // `tableIds` pode ter ficado desatualizada entre o momento em que foi feita e agora (ex.:
    // outra reserva concorrente acabou de ocupar uma dessas mesas).
    const cleaningMs = cleaningMinutes * 60 * 1000;
    const from = spStartOfDay(addDaysToDateKey(dateKey, -1));
    const to = spStartOfDay(addDaysToDateKey(dateKey, 2));
    const candidates = await tx.reservation.findMany({
      where: {
        environmentId,
        status: { in: RESERVATION_OCCUPYING_STATUSES },
        date: { gte: from, lt: to },
        tables: { some: { tableId: { in: tableIds } } },
      },
      select: { startTime: true, endTime: true, tables: { select: { tableId: true } } },
    });
    const hasConflict = candidates.some((r) => {
      const occupiedEnd = new Date(r.endTime.getTime() + cleaningMs);
      const overlaps = r.startTime < endTime && occupiedEnd > startTime;
      return overlaps && r.tables.some((t) => tableIds.includes(t.tableId));
    });
    if (hasConflict) throw new ReservationConflictError();

    const reservation = await tx.reservation.create({
      data: {
        empresaId,
        environmentId,
        clienteId: clienteId ?? null,
        date: spStartOfDay(dateKey),
        startTime,
        endTime,
        partySize,
        status: "PENDENTE",
        tables: { create: tableIds.map((tableId) => ({ tableId })) },
      },
    });
    return { id: reservation.id };
  });
}

