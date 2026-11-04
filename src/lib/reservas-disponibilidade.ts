import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { ReservationStatus } from "@prisma/client";
import { spDateKey, spStartOfDay } from "@/lib/timezone";
import { spDateTime, spWeekday } from "@/lib/checklist";
import { p2002ConstraintIncludes } from "@/lib/prisma-errors";

/**
 * Motor de disponibilidade de Reservas (Etapa 2) — ver prompt da tarefa "reservas-etapa2" (seção
 * 10 do documento original) e o bloco de comentário no `prisma/schema.prisma` acima de
 * `model ReservationEnvironment` para o racional de modelagem de Ambiente/Reserva.
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
 * determinado horário e compara com `ReservationEnvironment.capacity`. Nenhuma reserva fica
 * atrelada a mesa nenhuma — `reserveTablesTransacted` foi renomeada para
 * `reserveEnvironmentTransacted` e não recebe mais `tableIds`.
 *
 * REDESIGN (tarefa "reservas-slots-fixos", posterior ao redesign acima): o motor deixou de
 * funcionar por INTERVALO de horário (início/fim com sobreposição) e passou a funcionar por
 * SLOT FIXO — cada horário de início da grade (`generateSlotStarts`) tem sua própria capacidade
 * independente, contando só reservas com o MESMO horário de início EXATO (comparação de
 * igualdade de instante, não mais sobreposição `[start, end+limpeza)`). Motivo: a versão anterior
 * fazia uma reserva das 18h "contaminar" os slots seguintes (18h30, 19h, ...) enquanto a duração
 * configurada (`durationMinutes`) não tivesse terminado — o Matheus pediu para cada horário da
 * grade ter capacidade própria, sem isso. Consequência: `durationMinutes`/`cleaningMinutes`
 * deixaram de ter qualquer papel no cálculo de disponibilidade/conflito — ver comentário em
 * `ReservationSettingsValues` abaixo para o que cada um ainda faz (ou não faz) depois desta
 * mudança.
 */

/** Status de reserva que ainda OCUPA capacidade do ambiente (conta para a soma de ocupação).
 * Finalizada, Cancelada e Não compareceu liberam a capacidade — uma reserva finalizada já
 * terminou de verdade (não precisa aguardar o fim do intervalo original), e as outras duas nunca
 * ocuparam capacidade de fato.
 *
 * IMPORTANTE (intencional, confirmado na tarefa "reservas-slots-fixos"): não existe NENHUMA
 * liberação automática por tempo/tolerância aqui — uma reserva ocupa capacidade enquanto o status
 * gravado estiver nesta lista, ponto, independente de quanto tempo já passou do horário marcado.
 * `ReservationSettings.lateToleranceMinutes` continua existindo (configuração de quanto atraso a
 * loja tolera antes de considerar não-comparecimento), mas é só informativo nesta etapa — a
 * liberação automática por no-show/atraso (mudar o status sozinho depois de X minutos) é de etapa
 * futura (dashboard operacional). Mudar o status é sempre uma ação manual de quem opera a loja. */
export const RESERVATION_OCCUPYING_STATUSES: ReservationStatus[] = [
  "PENDENTE",
  "CONFIRMADA",
  "CLIENTE_CHEGOU",
  "ACOMODADO",
];

export type ReservationSettingsValues = {
  /** Desde "reservas-slots-fixos", NÃO é mais usado para gerar a grade de horários
   * (`generateSlotStarts`) nem para calcular conflito/capacidade (`occupiedCapacityFor`) — ver
   * comentário de redesign no topo do arquivo. O único uso restante é informativo: estimar o
   * `endTime` gravado em cada `Reservation` (exibido como "até às X" para o atendente/cliente),
   * calculado uma vez no momento da criação e congelado dali pra frente. */
  durationMinutes: number;
  /** Desde "reservas-slots-fixos", NÃO é mais usado para nada no motor de disponibilidade (nem
   * para gerar grade, nem para calcular capacidade, nem para o `endTime` estimado — ver
   * `durationMinutes` acima). Mantido no schema/settings só para não forçar uma migration nesta
   * tarefa (é lógica, não modelo de dado) e porque pode voltar a ter uso numa etapa futura (ex.:
   * se o Matheus decidir reintroduzir um tempo de giro entre reservas de verdade). A tela de
   * Configurações (`configuracoes-client.tsx`) nunca expôs este campo para edição — nenhuma
   * mudança de UI necessária aqui. */
  cleaningMinutes: number;
  /** Só a configuração em si — ver comentário em `RESERVATION_OCCUPYING_STATUSES` acima: não
   * aciona nenhuma liberação automática de capacidade. */
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

/** Horários de início possíveis dentro do expediente: todo horário de início dentro da janela
 * [`openTime`, `closeTime`], espaçados por `slotIntervalMinutes` — independente da duração
 * configurada da reserva (mudança "reservas-slots-fixos", ver comentário de redesign no topo do
 * arquivo). Inclui de propósito `t === close` (loop com `t <= close`): um horário exatamente
 * igual ao fechamento é um horário de início válido (ex.: abertura 18:00, fechamento 19:30,
 * intervalo 30min → gera exatamente [18:00, 18:30, 19:00, 19:30], os quatro) — pedir uma mesa
 * bem na hora de fechar é uma decisão de negócio válida; a loja controla isso ajustando o próprio
 * horário de fechamento, não por um corte implícito de "duração que não cabe". */
function generateSlotStarts(openTime: string, closeTime: string, slotIntervalMinutes: number): string[] {
  const open = timeToMinutes(openTime);
  const close = timeToMinutes(closeTime);
  const slots: string[] = [];
  for (let t = open; t <= close; t += Math.max(slotIntervalMinutes, 1)) {
    slots.push(minutesToTime(t));
  }
  return slots;
}

/** True se `time` corresponde EXATAMENTE a um dos horários de início que `generateSlotStarts`
 * geraria para esta janela/intervalo — nunca "está dentro do expediente" de forma aproximada (ex.:
 * "18:17" entre abertura 18:00 e fechamento 19:30 NÃO é válido se o intervalo é 30min; só os
 * múltiplos exatos do intervalo a partir da abertura são). Usado por `getAvailability` abaixo para
 * nunca tratar um horário arbitrário fora da grade (passado via parâmetro `time`, que vem direto do
 * cliente/rota) como um "slot" próprio com capacidade independente dos horários oficiais — achado
 * do Teulis na revisão desta tarefa ("reservas-slots-fixos"): sem esta checagem, um horário fora da
 * grade (ex.: "18:17") só disputava capacidade com OUTRAS reservas no mesmo horário arbitrário
 * "18:17", nunca com as reservas dos horários reais da grade (ex.: "18:00", "18:30"), permitindo
 * sobrevenda de capacidade por qualquer cliente externo (rota pública, sem sessão) bastando enviar
 * um horário que não é nenhum dos oferecidos na tela. Exportado (não só uso interno) como ponto
 * único de verdade sobre "o que é um horário de início válido" — evita qualquer rota precisar
 * reimplementar/duplicar esta lista literal no futuro. */
export function isValidSlotTime(openTime: string, closeTime: string, slotIntervalMinutes: number, time: string): boolean {
  return generateSlotStarts(openTime, closeTime, slotIntervalMinutes).includes(time);
}

function addDaysToDateKey(dateKey: string, delta: number): string {
  const d = spStartOfDay(dateKey);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Carrega `ReservationSettings` e as horas de funcionamento (`weekdayHours`) do dia da semana
 * pedido numa ÚNICA consulta (`findUnique` + `include`) — achado do Mylon na revisão geral de
 * Reservas (tarefa #190): `getAvailability` fazia essa busca duas vezes (uma só para os campos de
 * `ReservationSettingsValues`, outra quase idêntica só para `weekdayHours`), e esta função é
 * chamada em loop por `getMonthAvailability` (até ~30x por carregamento de calendário mensal) —
 * cada dia do mês pagava o custo de 2 queries de configuração em vez de 1. */
async function getReservationSettingsWithWeekdayHours(
  empresaId: string,
  weekday: number,
): Promise<{ settings: ReservationSettingsValues; weekdayHours: { openTime: string; closeTime: string; open: boolean } | undefined }> {
  const settingsRow = await prisma.reservationSettings.findUnique({
    where: { empresaId },
    include: { weekdayHours: { where: { dayOfWeek: weekday } } },
  });
  const settings: ReservationSettingsValues = settingsRow
    ? {
        durationMinutes: settingsRow.durationMinutes,
        cleaningMinutes: settingsRow.cleaningMinutes,
        lateToleranceMinutes: settingsRow.lateToleranceMinutes,
        minAdvanceMinutes: settingsRow.minAdvanceMinutes,
        maxAdvanceDays: settingsRow.maxAdvanceDays,
        specialGroupThreshold: settingsRow.specialGroupThreshold,
        slotIntervalMinutes: settingsRow.slotIntervalMinutes,
      }
    : DEFAULT_RESERVATION_SETTINGS;
  return { settings, weekdayHours: settingsRow?.weekdayHours[0] };
}

type OccupyingReservation = { start: Date; partySize: number };

/** Busca as reservas que ocupam capacidade no dia pedido (qualquer status de
 * `RESERVATION_OCCUPYING_STATUSES`) — usado para montar, em memória, a ocupação de CADA slot do
 * dia (`occupiedCapacityFor`) sem precisar de uma query por slot. Só precisa de `startTime`/
 * `partySize`: desde "reservas-slots-fixos" a ocupação é por horário de início EXATO, não mais
 * por sobreposição de intervalo, então `endTime`/tempo de limpeza não entram nesta conta (ver
 * comentário de redesign no topo do arquivo). Janela de busca é só o próprio dia — os horários de
 * funcionamento (`ReservationWeekdayHours.openTime/closeTime`) nunca cruzam a meia-noite (ver
 * `generateSlotStarts`), então o início de qualquer reserva de um dia cai sempre dentro do
 * próprio dia; não precisa mais da margem de dia anterior/seguinte que a versão antiga usava para
 * cobrir o caso de limpeza empurrando o fim de uma reserva para a madrugada. */
async function getOccupyingReservations(environmentId: string, dateKey: string): Promise<OccupyingReservation[]> {
  const from = spStartOfDay(dateKey);
  const to = spStartOfDay(addDaysToDateKey(dateKey, 1));
  const reservations = await prisma.reservation.findMany({
    where: {
      environmentId,
      status: { in: RESERVATION_OCCUPYING_STATUSES },
      date: { gte: from, lt: to },
    },
    select: { startTime: true, partySize: true },
  });
  return reservations.map((r) => ({ start: r.startTime, partySize: r.partySize }));
}

/** Soma de `partySize` das reservas de `occupying` com o MESMO horário de início EXATO de
 * `slotStart` (comparação de igualdade de instante). Mudança "reservas-slots-fixos": cada horário
 * da grade tem capacidade independente — uma reserva das 18h ocupa só o slot das 18h, nunca os
 * seguintes (18h30, 19h, ...), mesmo que a duração configurada "avançasse" por cima deles na
 * versão anterior (que comparava sobreposição de intervalo, não igualdade de início). */
function occupiedCapacityFor(slotStart: Date, occupying: OccupyingReservation[]): number {
  const slotStartMs = slotStart.getTime();
  return occupying.reduce((sum, o) => (o.start.getTime() === slotStartMs ? sum + o.partySize : sum), 0);
}

export type AvailabilitySlot = {
  time: string;
  startTime: string;
  endTime: string;
  /** Passa a regra de antecedência mínima/máxima (`minAdvanceMinutes`/`maxAdvanceDays`) — um
   * horário pode ter capacidade livre e ainda assim não ser oferecido por estar fora da janela de
   * antecedência permitida. */
  withinAdvanceWindow: boolean;
  /** Pessoas já reservadas neste ambiente com o MESMO horário de início exato deste slot (ver
   * `RESERVATION_OCCUPYING_STATUSES`/`occupiedCapacityFor`). */
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

  // `weekday` só depende de `dateKey` (cálculo puro, sem consulta) — calculado já aqui para poder
  // buscar `ReservationSettings` e `weekdayHours` do dia numa ÚNICA consulta abaixo (achado do
  // Mylon, tarefa #190 — ver JSDoc de `getReservationSettingsWithWeekdayHours`), em vez das duas
  // buscas quase idênticas que esta função fazia antes (uma só para `settings`, outra só para
  // `weekdayHours`). A ORDEM dos retornos antecipados abaixo (bloqueado -> fora-do-prazo ->
  // fechado) continua a mesma de antes — só a forma de buscar os dados mudou.
  const weekday = spWeekday(dateKey);
  const { settings, weekdayHours } = await getReservationSettingsWithWeekdayHours(empresaId, weekday);

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

  if (!weekdayHours || !weekdayHours.open) {
    return { open: false, reason: "fechado" };
  }

  // Quando `time` é informado (rotas de criação — ver `POST /api/reservar/[empresaKey]/reservas`
  // e `POST /api/reservas/reservas`), só o tratamos como um slot de verdade se ele realmente
  // pertence à grade gerada por `generateSlotStarts` (`isValidSlotTime`) — nunca aceitamos um
  // horário arbitrário do cliente como "slot próprio". Achado do Teulis: sem este filtro, um
  // horário fora da grade virava seu próprio slot com capacidade independente dos horários
  // oficiais (ver JSDoc de `isValidSlotTime` acima). Quando inválido, `slotTimes` fica vazio —
  // `slots` sai `[]` abaixo e o chamador não encontra nenhum `slot` correspondente ao horário
  // pedido, rejeitando a reserva (409) do mesmo jeito que rejeitaria falta de capacidade.
  const slotTimes = time
    ? (isValidSlotTime(weekdayHours.openTime, weekdayHours.closeTime, settings.slotIntervalMinutes, time) ? [time] : [])
    : generateSlotStarts(weekdayHours.openTime, weekdayHours.closeTime, settings.slotIntervalMinutes);

  const occupying = await getOccupyingReservations(environmentId, dateKey);
  const now = new Date();
  const minAdvanceMs = settings.minAdvanceMinutes * 60 * 1000;
  const openMinutes = timeToMinutes(weekdayHours.openTime);
  const closeMinutes = timeToMinutes(weekdayHours.closeTime);

  const slots: AvailabilitySlot[] = slotTimes.map((hhmm) => {
    const startTime = spDateTime(dateKey, hhmm);
    // `endTime` aqui é só uma ESTIMATIVA informativa (ex.: exibir "até às X" na reserva) —
    // `durationMinutes` não influencia mais a grade de horários nem o cálculo de capacidade (ver
    // `generateSlotStarts`/`occupiedCapacityFor` e o comentário de redesign no topo do arquivo).
    const endTime = new Date(startTime.getTime() + settings.durationMinutes * 60 * 1000);
    const slotMinutes = timeToMinutes(hhmm);
    // Mesmo critério de `generateSlotStarts`: um horário de início é válido até (e incluindo) o
    // próprio fechamento, sem depender da duração.
    const withinOperatingHours = slotMinutes >= openMinutes && slotMinutes <= closeMinutes;
    const withinAdvanceWindow = withinOperatingHours && startTime.getTime() - now.getTime() >= minAdvanceMs;

    const occupiedCapacity = occupiedCapacityFor(startTime, occupying);
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

export type DayAvailabilityStatus = "fechado" | "bloqueado" | "fora-do-prazo" | "sem-horario" | "esgotado" | "disponivel";

export type DayAvailability = {
  dateKey: string;
  status: DayAvailabilityStatus;
  /** Só presente quando `status` é "sem-horario", "esgotado" ou "disponivel" (dia aberto) — mesmo
   * campo de `AvailabilityResult.isSpecialGroup`, repassado pra o calendário poder sinalizar
   * visualmente que aquele `partySize` é um grupo especial (ver
   * `ReservationSettings.specialGroupThreshold`; o processo diferenciado em si continua fora de
   * escopo, só o aviso visual). */
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
 *
 * Dia aberto sem nenhum slot disponível sai como "esgotado" (capacidade cheia em TODOS os
 * horários da grade) ou "sem-horario" (qualquer outro motivo pontual — ver comentário no ponto em
 * que `isEsgotado` é calculado abaixo) — o calendário público usa essa distinção para colorir o
 * dia esgotado em vermelho em vez do laranja genérico de "sem horário" (tarefa
 * "reservas-cor-esgotado").
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
    // Tarefa "reservas-cor-esgotado" (pedido do Matheus, calendário público): distingue, dentro do
    // dia aberto sem nenhum slot disponível, o caso de ESGOTADO DE VERDADE (todo horário da grade já
    // está com a capacidade do ambiente cheia para `partySize`) de qualquer outro motivo de
    // indisponibilidade pontual — hoje, na prática, só um: para o dia de HOJE, à medida que a hora
    // avança, os horários restantes vão falhando `withinAdvanceWindow` (ficam "tarde demais" para a
    // antecedência mínima configurada) mesmo tendo capacidade livre; dias futuros quase nunca caem
    // aqui porque `withinAdvanceWindow` só reprova por antecedência, não por capacidade. Não é uma
    // conta nova: `occupiedCapacity`/`totalCapacity` já são calculados por `getAvailability` para
    // cada slot (ver `AvailabilitySlot` acima) — só não eram comparados aqui para decidir o status do
    // dia. `slots.length > 0` evita marcar como "esgotado" um dia sem nenhum horário na grade (não
    // deveria acontecer hoje — `closeTime > openTime` é validado em Configurações — mas não custa a
    // checagem, já que `every` em array vazio seria `true`).
    const isEsgotado = result.slots.length > 0 && result.slots.every((s) => s.occupiedCapacity + partySize > s.totalCapacity);
    days.push({
      dateKey,
      status: hasAvailableSlot ? "disponivel" : isEsgotado ? "esgotado" : "sem-horario",
      isSpecialGroup: result.isSpecialGroup,
    });
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
 * Revalida pelo MESMO critério de `occupiedCapacityFor` (slot fixo, horário de início exato) —
 * desde "reservas-slots-fixos" não recebe mais `cleaningMinutes` (deixou de ter qualquer papel
 * no cálculo de conflito, ver comentário de redesign no topo do arquivo).
 */
type ReserveEnvironmentTransactedBaseParams = {
  empresaId: string;
  environmentId: string;
  dateKey: string;
  startTime: Date;
  endTime: Date;
  partySize: number;
  clienteId?: string | null;
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
        // capacidade deste ambiente). Mesmo critério de `occupiedCapacityFor`: só reservas com o
        // MESMO horário de início EXATO de `startTime` contam (slot fixo, não sobreposição de
        // intervalo — ver comentário de redesign no topo do arquivo).
        const environment = await tx.reservationEnvironment.findUnique({
          where: { id: environmentId },
          select: { capacity: true },
        });
        if (!environment) throw new Error("Ambiente não encontrado.");

        const from = spStartOfDay(dateKey);
        const to = spStartOfDay(addDaysToDateKey(dateKey, 1));
        const candidates = await tx.reservation.findMany({
          where: {
            environmentId,
            status: { in: RESERVATION_OCCUPYING_STATUSES },
            date: { gte: from, lt: to },
          },
          select: { startTime: true, partySize: true },
        });
        const startTimeMs = startTime.getTime();
        const occupiedCapacity = candidates.reduce(
          (sum, r) => (r.startTime.getTime() === startTimeMs ? sum + r.partySize : sum),
          0,
        );
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
