import type { SatisfactionQuestionType, SatisfactionSurveyStatus, SatisfactionTheme } from "@prisma/client";

/** Brasil não observa horário de verão desde 2019 — America/Sao_Paulo é sempre UTC-3. */
const SP_OFFSET_HOURS = 3;

export function spDateKey(date: Date = new Date()): string {
  const spTime = new Date(date.getTime() - SP_OFFSET_HOURS * 60 * 60 * 1000);
  return spTime.toISOString().slice(0, 10);
}

export const SATISFACTION_STATUS_LABEL: Record<SatisfactionSurveyStatus, string> = {
  RASCUNHO: "Rascunho",
  PROGRAMADA: "Programada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const SATISFACTION_STATUS_TONE: Record<SatisfactionSurveyStatus, "default" | "success" | "warning" | "danger" | "info"> = {
  RASCUNHO: "default",
  PROGRAMADA: "info",
  EM_ANDAMENTO: "info",
  CONCLUIDA: "success",
  CANCELADA: "danger",
};

export const SATISFACTION_QUESTION_TYPE_LABEL: Record<SatisfactionQuestionType, string> = {
  ENPS: "eNPS (0 a 10)",
  AVALIACAO: "Avaliação (1 a 5)",
  ESCOLHA_UNICA: "Escolha única",
  MULTIPLA_ESCOLHA: "Múltipla escolha",
  SIM_NAO: "Sim ou não",
  ABERTA: "Resposta aberta",
};

export const SATISFACTION_THEME_LABEL: Record<SatisfactionTheme, string> = {
  LIDERANCA: "Liderança",
  AMBIENTE: "Ambiente",
  COMUNICACAO: "Comunicação",
  RECONHECIMENTO: "Reconhecimento",
  TREINAMENTO: "Treinamento",
  BEM_ESTAR: "Bem-estar",
  ESCALA_FOLGAS: "Escala e folgas",
};

/** Menor grupo de respostas que pode ser exibido segmentado, para proteger o anonimato. */
export const SATISFACTION_MIN_GROUP_SIZE = 5;

/**
 * Calcula o status real de uma pesquisa a partir das datas — sempre no
 * servidor. `RASCUNHO`/`CANCELADA` só mudam por ação explícita (publicar /
 * encerrar); uma vez publicada, o status decorre apenas de `now` vs.
 * `startDate`/`endDate`.
 */
export function computeSurveyStatus(params: {
  startDate: Date;
  endDate: Date;
  currentStatus: SatisfactionSurveyStatus;
  publish?: boolean;
  now?: Date;
}): SatisfactionSurveyStatus {
  const { startDate, endDate, currentStatus, publish, now = new Date() } = params;
  if (currentStatus === "CANCELADA") return "CANCELADA";
  if (currentStatus === "RASCUNHO" && !publish) return "RASCUNHO";
  if (now.getTime() > endDate.getTime()) return "CONCLUIDA";
  if (now.getTime() < startDate.getTime()) return "PROGRAMADA";
  return "EM_ANDAMENTO";
}

/** eNPS = % promotores (9-10) − % detratores (0-6), notas 7-8 são neutras. */
export function computeENPS(notas: number[]): { enps: number; promotores: number; neutros: number; detratores: number; total: number } {
  const total = notas.length;
  if (total === 0) return { enps: 0, promotores: 0, neutros: 0, detratores: 0, total: 0 };
  const promotores = notas.filter((n) => n >= 9).length;
  const detratores = notas.filter((n) => n <= 6).length;
  const neutros = total - promotores - detratores;
  const enps = Math.round(((promotores - detratores) / total) * 100);
  return { enps, promotores, neutros, detratores, total };
}

/**
 * Normaliza uma resposta numérica/booleana de um tipo "escalável" (eNPS,
 * avaliação, sim/não) para uma escala 0-100, para permitir comparar/agregar
 * perguntas de tipos diferentes num mesmo indicador de satisfação (ex.: por
 * tema, por setor).
 */
export function scorableValueToPercent(
  tipo: SatisfactionQuestionType,
  valorNumero: number | null,
  valorBooleano: boolean | null
): number | null {
  if (tipo === "ENPS" && valorNumero != null) return (valorNumero / 10) * 100;
  if (tipo === "AVALIACAO" && valorNumero != null) return ((valorNumero - 1) / 4) * 100;
  if (tipo === "SIM_NAO" && valorBooleano != null) return valorBooleano ? 100 : 0;
  return null;
}

export const SATISFACTION_SCORABLE_TYPES: SatisfactionQuestionType[] = ["ENPS", "AVALIACAO", "SIM_NAO"];
