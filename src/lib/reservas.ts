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
