import type { ChecklistEscalationType, ChecklistOccurrenceStatus, NotificationPriority } from "@prisma/client";

/**
 * Brasil não observa horário de verão desde 2019 — America/Sao_Paulo é
 * sempre UTC-3, então dá pra tratar o fuso com um offset fixo em vez de
 * uma lib de timezone completa.
 */
const SP_OFFSET_HOURS = 3;

/** "YYYY-MM-DD" no fuso de São Paulo, a partir de um Date (ou agora). */
export function spDateKey(date: Date = new Date()): string {
  const spTime = new Date(date.getTime() - SP_OFFSET_HOURS * 60 * 60 * 1000);
  return spTime.toISOString().slice(0, 10);
}

/** Meia-noite (00:00) de um "YYYY-MM-DD" em São Paulo, como instante UTC. */
export function spStartOfDay(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00-03:00`);
}

/** Combina um "YYYY-MM-DD" com um "HH:mm" (hora de São Paulo) num instante UTC. */
export function spDateTime(dateKey: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(`${dateKey}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);
}

export function spWeekday(dateKey: string): number {
  // 0=domingo ... 6=sábado, calculado no fuso de São Paulo
  return spStartOfDay(dateKey).getUTCDay();
}

const WEEKDAY_FIELDS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const;

export function weekdayFieldFor(dateKey: string): (typeof WEEKDAY_FIELDS)[number] {
  return WEEKDAY_FIELDS[spWeekday(dateKey)];
}

/** Pontos ganhos pelo responsável a cada checklist concluído. */
export const CHECKLIST_PONTOS_POR_CONCLUSAO = 10;

export const CHECKLIST_STATUS_LABEL: Record<ChecklistOccurrenceStatus, string> = {
  AGENDADO: "Agendado",
  DISPONIVEL: "Disponível",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO_NO_PRAZO: "Concluído no prazo",
  CONCLUIDO_COM_ATRASO: "Concluído com atraso",
  ATRASADO: "Atrasado",
  NAO_REALIZADO: "Não realizado",
  JUSTIFICADO: "Justificado",
  CANCELADO: "Cancelado",
};

export const CHECKLIST_STATUS_TONE: Record<ChecklistOccurrenceStatus, "default" | "success" | "warning" | "danger" | "info"> = {
  AGENDADO: "default",
  DISPONIVEL: "info",
  EM_ANDAMENTO: "info",
  CONCLUIDO_NO_PRAZO: "success",
  CONCLUIDO_COM_ATRASO: "warning",
  ATRASADO: "danger",
  NAO_REALIZADO: "danger",
  JUSTIFICADO: "default",
  CANCELADO: "default",
};

/**
 * Calcula o status "ao vivo" de uma ocorrência a partir dos horários e do
 * estado gravado — sempre no servidor, nunca só na tela. Estados
 * terminais (justificado/cancelado/concluído) nunca são recalculados.
 */
export function computeOccurrenceStatus(params: {
  releaseAt: Date;
  dueAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  currentStatus: ChecklistOccurrenceStatus;
  now?: Date;
}): ChecklistOccurrenceStatus {
  const { releaseAt, dueAt, startedAt, completedAt, currentStatus, now = new Date() } = params;

  if (currentStatus === "JUSTIFICADO" || currentStatus === "CANCELADO") return currentStatus;

  if (completedAt) {
    return completedAt.getTime() <= dueAt.getTime() ? "CONCLUIDO_NO_PRAZO" : "CONCLUIDO_COM_ATRASO";
  }
  if (currentStatus === "NAO_REALIZADO") return "NAO_REALIZADO";
  if (now.getTime() < releaseAt.getTime()) return "AGENDADO";
  if (now.getTime() >= dueAt.getTime()) return "ATRASADO";
  if (startedAt) return "EM_ANDAMENTO";
  return "DISPONIVEL";
}

/** Estados finais — uma vez atingidos, uma ocorrência nunca mais gera cobrança. */
export const CHECKLIST_TERMINAL_STATUSES: ChecklistOccurrenceStatus[] = [
  "CONCLUIDO_NO_PRAZO",
  "CONCLUIDO_COM_ATRASO",
  "JUSTIFICADO",
  "CANCELADO",
  "NAO_REALIZADO",
];

export const CHECKLIST_ESCALATION_PRIORITY: Record<ChecklistEscalationType, NotificationPriority> = {
  AVISO_ANTES: "INFORMACAO",
  NO_LIMITE: "ATENCAO",
  ATRASO_RESPONSAVEL: "ATENCAO",
  ALERTA_CRITICO: "CRITICA",
  NAO_REALIZADO: "CRITICA",
};

/**
 * Quais níveis de cobrança já deveriam ter disparado para uma ocorrência,
 * dado o instante atual — puro, sem tocar no banco. O chamador cruza isso
 * com o histórico de cobranças já enviadas (idempotência) para saber o que
 * falta notificar. Uma ocorrência concluída ou num estado terminal nunca
 * gera novos níveis (cobranças futuras são "canceladas" por construção).
 */
export function dueEscalationLevels(params: {
  dueAt: Date;
  completedAt: Date | null;
  currentStatus: ChecklistOccurrenceStatus;
  avisoAntesMinutos: number;
  avisoAtrasoResponsavelMinutos: number;
  alertaCriticoMinutos: number;
  naoRealizadoMinutos: number;
  now?: Date;
}): ChecklistEscalationType[] {
  const {
    dueAt,
    completedAt,
    currentStatus,
    avisoAntesMinutos,
    avisoAtrasoResponsavelMinutos,
    alertaCriticoMinutos,
    naoRealizadoMinutos,
    now = new Date(),
  } = params;

  if (completedAt || currentStatus === "JUSTIFICADO" || currentStatus === "CANCELADO" || currentStatus === "NAO_REALIZADO") {
    return [];
  }

  const minutesFromDue = (now.getTime() - dueAt.getTime()) / 60000;
  const levels: ChecklistEscalationType[] = [];
  if (minutesFromDue >= -avisoAntesMinutos && minutesFromDue < 0) levels.push("AVISO_ANTES");
  if (minutesFromDue >= 0) levels.push("NO_LIMITE");
  if (minutesFromDue >= avisoAtrasoResponsavelMinutos) levels.push("ATRASO_RESPONSAVEL");
  if (minutesFromDue >= alertaCriticoMinutos) levels.push("ALERTA_CRITICO");
  if (minutesFromDue >= naoRealizadoMinutos) levels.push("NAO_REALIZADO");
  return levels;
}
