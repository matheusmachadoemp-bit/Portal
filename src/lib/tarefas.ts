import type { Task, TaskRecurrence } from "@prisma/client";

// ---------------------------------------------------------------------------
// Setores (organizacional — diferente do SECTORS de src/lib/estoque.ts, que é
// por área física de armazenamento)
// ---------------------------------------------------------------------------

export const TASK_SECTORS = [
  "Gestão",
  "Gerência",
  "Cozinha",
  "Salão",
  "Delivery",
  "Bar",
  "Financeiro",
  "RH",
  "Marketing",
  "Compras",
  "Estoque",
  "Manutenção",
  "Outros",
] as const;

// Ícone (sempre azul na UI) e cor (usada no fundo do selo) de cada setor.
export const TASK_SECTOR_OPTIONS: { key: (typeof TASK_SECTORS)[number]; icon: string; color: string }[] = [
  { key: "Gestão", icon: "Briefcase", color: "#2952E3" },
  { key: "Gerência", icon: "UserCog", color: "#8b5cf6" },
  { key: "Cozinha", icon: "ChefHat", color: "#f97316" },
  { key: "Salão", icon: "UtensilsCrossed", color: "#eab308" },
  { key: "Delivery", icon: "Bike", color: "#22c55e" },
  { key: "Bar", icon: "Wine", color: "#ec4899" },
  { key: "Financeiro", icon: "DollarSign", color: "#10b981" },
  { key: "RH", icon: "Users", color: "#06b6d4" },
  { key: "Marketing", icon: "Megaphone", color: "#f43f5e" },
  { key: "Compras", icon: "ShoppingCart", color: "#a855f7" },
  { key: "Estoque", icon: "Package", color: "#84cc16" },
  { key: "Manutenção", icon: "Wrench", color: "#64748b" },
  { key: "Outros", icon: "MoreHorizontal", color: "#71717a" },
];

export const TASK_SECTOR_ICON: Record<string, string> = Object.fromEntries(
  TASK_SECTOR_OPTIONS.map((s) => [s.key, s.icon])
);
export const TASK_SECTOR_COLOR: Record<string, string> = Object.fromEntries(
  TASK_SECTOR_OPTIONS.map((s) => [s.key, s.color])
);

// ---------------------------------------------------------------------------
// Prioridade
// ---------------------------------------------------------------------------

export const TASK_PRIORITY_OPTIONS = [
  { key: "URGENTE", label: "Urgente", color: "#ef4444", emoji: "🔴" },
  { key: "ALTA", label: "Alta", color: "#f97316", emoji: "🟠" },
  { key: "MEDIA", label: "Média", color: "#eab308", emoji: "🟡" },
  { key: "BAIXA", label: "Baixa", color: "#22c55e", emoji: "🟢" },
] as const;

export const TASK_PRIORITY_LABEL: Record<string, string> = Object.fromEntries(
  TASK_PRIORITY_OPTIONS.map((p) => [p.key, p.label])
);
export const TASK_PRIORITY_COLOR: Record<string, string> = Object.fromEntries(
  TASK_PRIORITY_OPTIONS.map((p) => [p.key, p.color])
);
export const TASK_PRIORITY_ORDER: Record<string, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };

// ---------------------------------------------------------------------------
// Status (ATRASADA é calculada, não é gravada no banco)
// ---------------------------------------------------------------------------

export type EffectiveTaskStatus = "PENDENTE" | "EM_ANDAMENTO" | "AGUARDANDO_VALIDACAO" | "CONCLUIDA" | "ATRASADA";

export const TASK_STATUS_OPTIONS: { key: EffectiveTaskStatus; label: string; tone: "default" | "success" | "warning" | "danger" | "info" }[] = [
  { key: "PENDENTE", label: "Pendente", tone: "default" },
  { key: "EM_ANDAMENTO", label: "Em andamento", tone: "info" },
  { key: "AGUARDANDO_VALIDACAO", label: "Aguardando validação", tone: "warning" },
  { key: "CONCLUIDA", label: "Concluída", tone: "success" },
  { key: "ATRASADA", label: "Atrasada", tone: "danger" },
];

export const TASK_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  TASK_STATUS_OPTIONS.map((s) => [s.key, s.label])
);
export const TASK_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = Object.fromEntries(
  TASK_STATUS_OPTIONS.map((s) => [s.key, s.tone])
);

/** "Atrasada" nunca é gravada como status — é derivada na leitura. */
export function isTaskOverdue(task: { status: string; dueDate: Date | string | null }): boolean {
  if (!task.dueDate || task.status === "CONCLUIDA") return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

export function effectiveTaskStatus(task: { status: string; dueDate: Date | string | null }): EffectiveTaskStatus {
  if (isTaskOverdue(task)) return "ATRASADA";
  return task.status as EffectiveTaskStatus;
}

// ---------------------------------------------------------------------------
// Comprovação
// ---------------------------------------------------------------------------

export const TASK_PROOF_TYPE_OPTIONS = [
  { key: "NENHUMA", label: "Nenhuma" },
  { key: "FOTO", label: "Foto" },
  { key: "ARQUIVO", label: "Arquivo" },
  { key: "TEXTO", label: "Texto" },
  { key: "FOTO_TEXTO", label: "Foto + texto" },
] as const;

export const TASK_PROOF_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TASK_PROOF_TYPE_OPTIONS.map((p) => [p.key, p.label])
);

// ---------------------------------------------------------------------------
// Recorrência
// ---------------------------------------------------------------------------

export const TASK_RECURRENCE_FREQ_OPTIONS = [
  { key: "NENHUMA", label: "Não repetir" },
  { key: "DIARIA", label: "Diariamente" },
  { key: "SEMANAL", label: "Dias específicos da semana" },
  { key: "QUINZENAL", label: "Quinzenalmente" },
  { key: "MENSAL", label: "Mensalmente" },
  { key: "PERSONALIZADA", label: "Personalizado (a cada N dias)" },
] as const;

export const TASK_RECURRENCE_FREQ_LABEL: Record<string, string> = Object.fromEntries(
  TASK_RECURRENCE_FREQ_OPTIONS.map((f) => [f.key, f.label])
);

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type RecurrenceConfig = { weekdays?: number[]; intervalDays?: number; dayOfMonth?: number };

function parseRecurrenceConfig(config: string | null): RecurrenceConfig {
  if (!config) return {};
  try {
    return JSON.parse(config) as RecurrenceConfig;
  } catch {
    return {};
  }
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Dado o dia de referência, diz se essa recorrência deve gerar uma ocorrência nesse dia. */
export function recurrenceMatchesDate(recurrence: Pick<TaskRecurrence, "freq" | "config" | "createdAt">, referenceDate: Date): boolean {
  const ref = startOfDay(referenceDate);
  const created = startOfDay(recurrence.createdAt);
  const diffDays = Math.round((ref.getTime() - created.getTime()) / 86400000);
  if (diffDays < 0) return false;

  const config = parseRecurrenceConfig(recurrence.config);

  switch (recurrence.freq) {
    case "DIARIA":
      return true;
    case "SEMANAL": {
      const weekdays = config.weekdays && config.weekdays.length > 0 ? config.weekdays : [created.getDay()];
      return weekdays.includes(ref.getDay());
    }
    case "QUINZENAL":
      return diffDays % 14 === 0;
    case "MENSAL": {
      const dayOfMonth = config.dayOfMonth ?? created.getDate();
      return ref.getDate() === dayOfMonth;
    }
    case "PERSONALIZADA": {
      const interval = config.intervalDays && config.intervalDays > 0 ? config.intervalDays : 1;
      return diffDays % interval === 0;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Origem da tarefa (preparado para automações/integrações futuras)
// ---------------------------------------------------------------------------

export const TASK_SOURCE_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  REUNIAO: "Reunião",
  INDICADOR: "Indicador",
  CHECKLIST: "Checklist",
  OCORRENCIA: "Ocorrência",
  MANUTENCAO: "Manutenção",
  TREINAMENTO: "Treinamento",
  AUTOMACAO: "Automação",
};

// ---------------------------------------------------------------------------
// Histórico — rótulos legíveis para as ações registradas em TaskHistory
// ---------------------------------------------------------------------------

export const TASK_HISTORY_ACTION_LABEL: Record<string, (detail: string | null) => string> = {
  CREATED: () => "criou a tarefa",
  ASSIGNED: (d) => `atribuiu a tarefa a ${d ?? "alguém"}`,
  STARTED: () => "iniciou a tarefa",
  CHECKLIST_ITEM_DONE: (d) => `concluiu o item do checklist "${d ?? ""}"`,
  CHECKLIST_ITEM_REOPENED: (d) => `reabriu o item do checklist "${d ?? ""}"`,
  PROOF_SUBMITTED: () => "enviou a comprovação",
  APPROVED: () => "aprovou a tarefa",
  REJECTED: (d) => `reprovou a tarefa${d ? ` — motivo: ${d}` : ""}`,
  COMPLETED: () => "concluiu a tarefa",
  COMMENTED: () => "comentou na tarefa",
  STATUS_CHANGED: (d) => `alterou o status para ${d ?? ""}`,
};

export function describeTaskHistoryAction(action: string, detail: string | null): string {
  const fn = TASK_HISTORY_ACTION_LABEL[action];
  return fn ? fn(detail) : action;
}

export type TaskWithDueDate = Pick<Task, "status" | "dueDate">;
