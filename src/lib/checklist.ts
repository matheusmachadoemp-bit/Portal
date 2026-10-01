import type { ChecklistEscalationType, ChecklistOccurrenceStatus, NotificationPriority } from "@prisma/client";
import { SP_OFFSET_HOURS, spDateKey, spStartOfDay, spEndOfDay } from "@/lib/timezone";

/**
 * `spDateKey`/`spStartOfDay`/`spEndOfDay` moraram aqui (e duplicadas,
 * palavra por palavra, em `satisfaction.ts`) até virarem `@/lib/timezone` —
 * reexportadas abaixo para não quebrar os ~30 pontos do app que já
 * importavam esses nomes daqui.
 */
export { spDateKey, spStartOfDay, spEndOfDay };

/**
 * Hora (0-23) e minuto (0-59) de um instante, no fuso de São Paulo — nunca
 * `date.getHours()`/`date.getMinutes()` puros, que dependem do fuso do
 * runtime onde o código roda (UTC no servidor, América/São_Paulo no
 * navegador do usuário) e por isso dão respostas diferentes pro mesmo
 * instante real dependendo de onde rodam (mesma causa raiz do bug de
 * "Ontem" em Vendas > Faturamento não achar vendas — ver `resolvePeriod` em
 * `@/lib/periods.ts` — que também afetava o agrupamento por hora do dia).
 */
export function spHours(date: Date): number {
  return new Date(date.getTime() - SP_OFFSET_HOURS * 60 * 60 * 1000).getUTCHours();
}
export function spMinutes(date: Date): number {
  return new Date(date.getTime() - SP_OFFSET_HOURS * 60 * 60 * 1000).getUTCMinutes();
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

/** Formata uma quantidade de minutos como "Xh Ymin" (ou só "Ymin" quando menos de 1h). */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
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

export const CHECKLIST_STATUS_TONE: Record<ChecklistOccurrenceStatus, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  AGENDADO: "purple",
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
