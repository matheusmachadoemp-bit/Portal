import type { ChecklistOccurrenceStatus } from "@prisma/client";

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
