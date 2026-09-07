export const PRODUCTION_STATUS_OPTIONS = [
  { key: "PENDENTE", label: "Pendente", tone: "warning" as const },
  { key: "EM_PRODUCAO", label: "Em Produção", tone: "info" as const },
  { key: "CONCLUIDO", label: "Concluído", tone: "success" as const },
  { key: "ATRASADO", label: "Atrasado", tone: "danger" as const },
];

export const PRODUCTION_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  PRODUCTION_STATUS_OPTIONS.map((s) => [s.key, s.label])
);
export const PRODUCTION_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> =
  Object.fromEntries(PRODUCTION_STATUS_OPTIONS.map((s) => [s.key, s.tone]));

export const PRODUCTION_PRIORITY_OPTIONS = [
  { key: "URGENTE", label: "Urgente", color: "#ef4444" },
  { key: "ALTA", label: "Alta", color: "#f97316" },
  { key: "NORMAL", label: "Normal", color: "#3b82f6" },
  { key: "BAIXA", label: "Baixa", color: "#6b7280" },
];

export const PRODUCTION_PRIORITY_LABEL: Record<string, string> = Object.fromEntries(
  PRODUCTION_PRIORITY_OPTIONS.map((p) => [p.key, p.label])
);
export const PRODUCTION_PRIORITY_COLOR: Record<string, string> = Object.fromEntries(
  PRODUCTION_PRIORITY_OPTIONS.map((p) => [p.key, p.color])
);
/** Ordem de prioridade para ordenação (menor = mais prioritário). */
export const PRODUCTION_PRIORITY_ORDER: Record<string, number> = {
  URGENTE: 0,
  ALTA: 1,
  NORMAL: 2,
  BAIXA: 3,
};

export const PRODUCTION_ITEM_TYPE_OPTIONS = [
  { key: "VARIAVEL", label: "Variável (calculada pela previsão)" },
  { key: "FIXO", label: "Fixo (quantidade mínima diária)" },
];

export const PRODUCTION_ITEM_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  PRODUCTION_ITEM_TYPE_OPTIONS.map((t) => [t.key, t.label])
);

export const PRODUCTION_AJUSTE_MOTIVO_OPTIONS = [
  { key: "EVENTO", label: "Evento" },
  { key: "RESERVA", label: "Reserva" },
  { key: "PROMOCAO", label: "Promoção" },
  { key: "EXPECTATIVA_MOVIMENTO", label: "Expectativa de movimento" },
  { key: "ESTOQUE", label: "Estoque" },
  { key: "FERIADO", label: "Feriado" },
  { key: "OUTRO", label: "Outro" },
];

export const PRODUCTION_AJUSTE_MOTIVO_LABEL: Record<string, string> = Object.fromEntries(
  PRODUCTION_AJUSTE_MOTIVO_OPTIONS.map((m) => [m.key, m.label])
);

export const PRODUCTION_STOCK_MOVEMENT_TYPE_LABEL: Record<string, string> = {
  PRODUCAO: "Produção finalizada",
  SALDO_ANTERIOR: "Saldo do turno anterior",
  AJUSTE: "Ajuste manual",
  PERDA: "Perda",
};

export const WEEKDAY_LABEL: Record<number, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};

export const WEEKDAY_SHORT_LABEL: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};

const HISTORY_ACTION_LABEL: Record<string, string> = {
  CRIADO: "criou a ordem de produção",
  INICIADO: "iniciou a produção",
  FINALIZADO: "finalizou a produção",
  AJUSTADO: "ajustou a quantidade sugerida",
  ATRASADO: "ordem marcada como atrasada",
  STATUS_ALTERADO: "alterou o status",
};

export function describeProductionHistoryAction(action: string): string {
  return HISTORY_ACTION_LABEL[action] ?? action;
}

/** Uma ordem sem prazo cumprido, ainda não concluída, conta como atrasada — calculado ao vivo,
 * sem depender só do cron rodar (mesmo padrão de `isChamadoOverdue`/tarefas). */
export function isProductionOrderOverdue(order: { prazo: string | Date; status: string }): boolean {
  if (order.status === "CONCLUIDO") return false;
  const prazo = typeof order.prazo === "string" ? new Date(order.prazo) : order.prazo;
  return prazo.getTime() < Date.now();
}

export function effectiveProductionStatus(order: { prazo: string | Date; status: string }): string {
  if (order.status !== "CONCLUIDO" && isProductionOrderOverdue(order)) return "ATRASADO";
  return order.status;
}

/** Ordenação da tela "Produção de Hoje": atrasados → urgentes → menor prazo → resto (seção 19). */
export function compareProductionOrders(
  a: { prazo: string | Date; status: string; prioridade: string },
  b: { prazo: string | Date; status: string; prioridade: string }
): number {
  const aOverdue = isProductionOrderOverdue(a) ? 0 : 1;
  const bOverdue = isProductionOrderOverdue(b) ? 0 : 1;
  if (aOverdue !== bOverdue) return aOverdue - bOverdue;

  const aPriority = PRODUCTION_PRIORITY_ORDER[a.prioridade] ?? 9;
  const bPriority = PRODUCTION_PRIORITY_ORDER[b.prioridade] ?? 9;
  if (aPriority !== bPriority) return aPriority - bPriority;

  const aPrazo = typeof a.prazo === "string" ? new Date(a.prazo).getTime() : a.prazo.getTime();
  const bPrazo = typeof b.prazo === "string" ? new Date(b.prazo).getTime() : b.prazo.getTime();
  return aPrazo - bPrazo;
}

/** Compara planejado x produzido e sinaliza quando a diferença passa da tolerância (seção 18). */
export function compareProducedToPlanned(
  planejado: number,
  produzido: number,
  toleranciaPct: number
): { diferenca: number; diferencaPercent: number; alerta: "abaixo" | "acima" | null } {
  const diferenca = produzido - planejado;
  const diferencaPercent = planejado > 0 ? (diferenca / planejado) * 100 : 0;
  if (Math.abs(diferencaPercent) <= toleranciaPct) return { diferenca, diferencaPercent, alerta: null };
  return { diferenca, diferencaPercent, alerta: diferenca < 0 ? "abaixo" : "acima" };
}
