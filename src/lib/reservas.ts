// Reservas — Etapa 1 (estrutura administrativa). Constantes compartilhadas entre a rota de API
// (src/app/api/reservas/configuracoes/**) e a tela (src/app/portal/reservas/configuracoes/**).

/** 0 = Domingo ... 6 = Sábado — mesma convenção de `ProductionWeekdayWeight.weekday` /
 * `WEEKDAY_LABEL` (src/lib/producao.ts), só que definida aqui de novo (em vez de importada de
 * lá) pra não criar uma dependência cruzada entre os módulos Reservas e Produção só por um mapa
 * de 7 nomes de dia. */
export const RESERVATION_WEEKDAY_LABEL: Record<number, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};

export const RESERVATION_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** Cargos que podem administrar as configurações de Reservas — mesmo critério usado na
 * visibilidade padrão do módulo (ver `RESERVAS_DEFAULT_ACCESS_PROFILE_KEYS`,
 * `prisma/seed.ts`, e a migration `20261026041000_reservas_etapa1_menu_permissao`):
 * Administrador, Gestor e Gerente. Supervisor fica de fora de propósito (diferente de outros
 * módulos operacionais, ex. `PRODUCTION_MANAGER_ROLES`) — decisão explícita do Matheus de que só
 * esses 3 cargos administram Reservas por padrão; qualquer outro cargo só se tiver um
 * `UserPermission` (override manual) concedendo `canEdit`, verificado por `hasModulePermission`
 * de qualquer forma — este array é só uma trava adicional por cargo, igual ao padrão já usado em
 * `PRODUCTION_MANAGER_ROLES`. */
export const RESERVAS_MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE"];

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Valida um horário "HH:mm" (ex.: "18:00") vindo de fora (body da rota) — mesmo formato usado
 * em todo o resto do schema (ver `src/lib/timezone.ts` para a convenção equivalente de DIA). */
export function isValidHHMM(value: unknown): value is string {
  return typeof value === "string" && HHMM_PATTERN.test(value);
}

// Reservas — Etapa 2 (mesas, ambientes e motor de disponibilidade). Constantes compartilhadas
// entre as rotas de API (src/app/api/reservas/{ambientes,mesas,combinacoes,disponibilidade}/**)
// e a tela de Mesas e Ambientes (src/app/portal/reservas/mesas-ambientes/**).

export const RESERVATION_TABLE_STATUS_LABEL: Record<string, string> = {
  DISPONIVEL: "Disponível",
  MANUTENCAO: "Manutenção",
  INATIVA: "Inativa",
};

export const RESERVATION_TABLE_STATUSES = Object.keys(RESERVATION_TABLE_STATUS_LABEL);

/** Valida um inteiro positivo (capacidade de ambiente/mesa, quantidade de pessoas etc.) vindo de
 * fora — `Number.isInteger` sozinho aceita `0`/negativo, por isso o `> 0` explícito. */
export function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Reservas — Etapa 3 (página pública `/reservar/[empresaKey]`). `onlyDigits` fica aqui (em vez de
// reexportado de `src/lib/customer-survey-server.ts`, que já tem uma cópia idêntica) porque este
// arquivo não importa Prisma — pode ser usado tanto pelas rotas públicas novas (server) quanto
// pelo componente client do formulário (`"use client"`, nunca pode puxar o Prisma Client pro
// bundle do navegador), mesmo racional já documentado em `avaliar-client.tsx`.

/** Mantém só os dígitos de um telefone informado em texto livre (com DDD, com ou sem máscara). */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validação simples de formato (não confirma que o e-mail existe/recebe mensagens) — suficiente
 * para recusar erros de digitação óbvios num campo opcional do formulário público. */
export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

// Reservas — Etapa 4 (telas administrativas: Visão Geral, Reservas, Calendário). Constantes
// compartilhadas entre as rotas de API (src/app/api/reservas/reservas/**,
// src/app/api/reservas/resumo) e as telas (src/app/portal/reservas/{reservas,visao-geral,
// calendario}/**). Fica neste arquivo (em vez de `reservas-disponibilidade.ts`, que já tem
// `RESERVATION_OCCUPYING_STATUSES`) porque este arquivo não importa Prisma — os componentes
// cliente das 3 telas (ex.: o `<select>` de mudança de status) precisam do label/transições sem
// puxar o Prisma Client pro bundle do navegador, mesmo racional do resto deste arquivo.

/** Rótulo em português de cada valor do enum `ReservationStatus` (schema.prisma) — mesma
 * convenção de `RESERVATION_TABLE_STATUS_LABEL` acima. */
export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  CONFIRMADA: "Confirmada",
  CLIENTE_CHEGOU: "Cliente chegou",
  ACOMODADO: "Acomodado",
  FINALIZADA: "Finalizada",
  CANCELADA: "Cancelada",
  NAO_COMPARECEU: "Não compareceu",
};

export const RESERVATION_STATUSES = Object.keys(RESERVATION_STATUS_LABEL);

/** Tom de `Badge` (src/components/ui/stat-card.tsx) para cada status — usado nas 3 telas pra
 * colorir o status de forma consistente. */
export const RESERVATION_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  PENDENTE: "warning",
  CONFIRMADA: "info",
  CLIENTE_CHEGOU: "purple",
  ACOMODADO: "success",
  FINALIZADA: "default",
  CANCELADA: "danger",
  NAO_COMPARECEU: "danger",
};

/** Transições de status permitidas a partir de cada status atual — a tela "Reservas" só oferece
 * estas opções (nunca um "salto" livre entre quaisquer dois status), e a rota `PATCH
 * /api/reservas/reservas/[id]` recusa qualquer transição fora deste mapa (ver comentário na
 * rota). Os 3 status terminais (`FINALIZADA`/`CANCELADA`/`NAO_COMPARECEU`) não têm saída — uma
 * reserva encerrada não volta a ocupar mesa (ver `RESERVATION_OCCUPYING_STATUSES`,
 * `src/lib/reservas-disponibilidade.ts`); reabrir uma reserva encerrada está fora de escopo
 * desta etapa (criar uma nova reserva cobre o caso de "a pessoa voltou a querer a mesa"). */
export const RESERVATION_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDENTE: ["CONFIRMADA", "CANCELADA"],
  CONFIRMADA: ["CLIENTE_CHEGOU", "NAO_COMPARECEU", "CANCELADA"],
  CLIENTE_CHEGOU: ["ACOMODADO", "CANCELADA"],
  ACOMODADO: ["FINALIZADA"],
  FINALIZADA: [],
  CANCELADA: [],
  NAO_COMPARECEU: [],
};

// Reservas — Etapa 4 (Fila de Espera). Constantes compartilhadas entre as rotas de API
// (src/app/api/reservas/fila-espera/**) e a tela (src/app/portal/reservas/fila-espera/**). Ver
// comentário de modelagem no `prisma/schema.prisma` acima de `model ReservationWaitlistEntry`.

export const RESERVATION_WAITLIST_STATUS_LABEL: Record<string, string> = {
  AGUARDANDO: "Aguardando",
  CONTATADO: "Contatado",
  CONVERTIDO_EM_RESERVA: "Convertido em reserva",
  CANCELADO: "Cancelado",
  EXPIRADO: "Expirado",
};

export const RESERVATION_WAITLIST_STATUSES = Object.keys(RESERVATION_WAITLIST_STATUS_LABEL);
