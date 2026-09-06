export const KANBAN_COLUMNS = [
  { key: "RASCUNHO", label: "Rascunho", icon: "FileEdit", color: "#6b7280" },
  { key: "ABERTO", label: "Aberto", icon: "AlertCircle", color: "#3b82f6" },
  { key: "AGUARDANDO_AVALIACAO", label: "Aguardando Avaliação", icon: "Search", color: "#a855f7" },
  { key: "AGUARDANDO_ORCAMENTO", label: "Aguardando Orçamento", icon: "FileText", color: "#eab308" },
  { key: "AGUARDANDO_APROVACAO", label: "Aguardando Aprovação", icon: "Clock", color: "#f97316" },
  { key: "APROVADO", label: "Aprovado", icon: "ThumbsUp", color: "#14b8a6" },
  { key: "EM_MANUTENCAO", label: "Em Manutenção", icon: "Wrench", color: "#2952E3" },
  { key: "AGUARDANDO_PECA", label: "Aguardando Peça", icon: "Package", color: "#f59e0b" },
  { key: "RESOLVIDO", label: "Resolvido", icon: "CheckCircle2", color: "#22c55e" },
  { key: "CANCELADO", label: "Cancelado", icon: "XCircle", color: "#ef4444" },
] as const;

export type ChamadoStatusKey = (typeof KANBAN_COLUMNS)[number]["key"];

export const CHAMADO_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  KANBAN_COLUMNS.map((c) => [c.key, c.label])
);

export const CHAMADO_STATUS_COLOR: Record<string, string> = Object.fromEntries(
  KANBAN_COLUMNS.map((c) => [c.key, c.color])
);

export const CHAMADO_PRIORIDADE_OPTIONS = [
  { key: "BAIXA", label: "Baixa", color: "#6b7280" },
  { key: "MEDIA", label: "Média", color: "#eab308" },
  { key: "ALTA", label: "Alta", color: "#f97316" },
  { key: "URGENTE", label: "Urgente", color: "#ef4444" },
] as const;

export const CHAMADO_PRIORIDADE_LABEL: Record<string, string> = Object.fromEntries(
  CHAMADO_PRIORIDADE_OPTIONS.map((p) => [p.key, p.label])
);
export const CHAMADO_PRIORIDADE_COLOR: Record<string, string> = Object.fromEntries(
  CHAMADO_PRIORIDADE_OPTIONS.map((p) => [p.key, p.color])
);

export const CHAMADO_CATEGORIA_OPTIONS = [
  { key: "EQUIPAMENTO", label: "Equipamento", icon: "Cog" },
  { key: "ELETRICA", label: "Elétrica", icon: "Zap" },
  { key: "HIDRAULICA", label: "Hidráulica", icon: "Droplet" },
  { key: "ESTRUTURA", label: "Estrutura", icon: "Building2" },
  { key: "MOBILIARIO", label: "Mobiliário", icon: "Armchair" },
  { key: "REFRIGERACAO", label: "Refrigeração", icon: "Snowflake" },
  { key: "INFORMATICA", label: "Informática", icon: "Monitor" },
  { key: "SEGURANCA", label: "Segurança", icon: "Shield" },
  { key: "OUTRO", label: "Outro", icon: "MoreHorizontal" },
] as const;

export const CHAMADO_CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  CHAMADO_CATEGORIA_OPTIONS.map((c) => [c.key, c.label])
);

export const EQUIPAMENTO_STATUS_OPTIONS = [
  { key: "FUNCIONANDO", label: "Funcionando", tone: "success" as const },
  { key: "ATENCAO", label: "Atenção", tone: "warning" as const },
  { key: "EM_MANUTENCAO", label: "Em Manutenção", tone: "info" as const },
  { key: "PARADO", label: "Parado", tone: "danger" as const },
  { key: "DESATIVADO", label: "Desativado", tone: "default" as const },
  { key: "DESCARTADO", label: "Descartado", tone: "default" as const },
];

export const EQUIPAMENTO_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  EQUIPAMENTO_STATUS_OPTIONS.map((s) => [s.key, s.label])
);
export const EQUIPAMENTO_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> =
  Object.fromEntries(EQUIPAMENTO_STATUS_OPTIONS.map((s) => [s.key, s.tone]));

export const MANUTENCAO_TIPO_OPTIONS = [
  { key: "PREVENTIVA", label: "Preventiva" },
  { key: "CORRETIVA", label: "Corretiva" },
  { key: "EMERGENCIAL", label: "Emergencial" },
  { key: "INSPECAO", label: "Inspeção" },
  { key: "INSTALACAO", label: "Instalação" },
  { key: "LIMPEZA_TECNICA", label: "Limpeza Técnica" },
];

export const MANUTENCAO_TIPO_LABEL: Record<string, string> = Object.fromEntries(
  MANUTENCAO_TIPO_OPTIONS.map((t) => [t.key, t.label])
);

export const MANUTENCAO_FREQUENCIA_OPTIONS = [
  { key: "NENHUMA", label: "Nenhuma (única)" },
  { key: "SEMANAL", label: "Semanal" },
  { key: "QUINZENAL", label: "Quinzenal" },
  { key: "MENSAL", label: "Mensal" },
  { key: "BIMESTRAL", label: "Bimestral" },
  { key: "TRIMESTRAL", label: "Trimestral" },
  { key: "SEMESTRAL", label: "Semestral" },
  { key: "ANUAL", label: "Anual" },
  { key: "PERSONALIZADA", label: "Personalizada (dias)" },
];

export const PREVENTIVA_OCORRENCIA_STATUS_OPTIONS = [
  { key: "PROGRAMADA", label: "Programada", tone: "default" as const },
  { key: "EM_EXECUCAO", label: "Em execução", tone: "info" as const },
  { key: "CONCLUIDA", label: "Concluída", tone: "success" as const },
  { key: "REAGENDADA", label: "Reagendada", tone: "warning" as const },
  { key: "CANCELADA", label: "Cancelada", tone: "danger" as const },
];

export const PREVENTIVA_OCORRENCIA_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  PREVENTIVA_OCORRENCIA_STATUS_OPTIONS.map((s) => [s.key, s.label])
);
export const PREVENTIVA_OCORRENCIA_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> =
  Object.fromEntries(PREVENTIVA_OCORRENCIA_STATUS_OPTIONS.map((s) => [s.key, s.tone]));

/** Rótulo de exibição para uma ocorrência: distingue "Atrasada"/"Vence hoje"/"Próxima do vencimento"
 * (derivados da data, sem alterar o status armazenado) das etiquetas reais do enum. */
export function describePreventivaOcorrenciaLabel(status: string, dataProgramada: string | Date): {
  label: string;
  tone: "default" | "success" | "warning" | "danger" | "info";
} {
  if (status !== "PROGRAMADA") {
    return { label: PREVENTIVA_OCORRENCIA_STATUS_LABEL[status] ?? status, tone: PREVENTIVA_OCORRENCIA_STATUS_TONE[status] ?? "default" };
  }
  const data = typeof dataProgramada === "string" ? new Date(dataProgramada) : dataProgramada;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dia = new Date(data);
  dia.setHours(0, 0, 0, 0);
  const diffDias = Math.round((dia.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias < 0) return { label: "Atrasada", tone: "danger" };
  if (diffDias === 0) return { label: "Vence hoje", tone: "warning" };
  if (diffDias <= 7) return { label: "Próxima do vencimento", tone: "warning" };
  return { label: "Programada", tone: "default" };
}

export const MANUTENCAO_FREQUENCIA_LABEL: Record<string, string> = Object.fromEntries(
  MANUTENCAO_FREQUENCIA_OPTIONS.map((f) => [f.key, f.label])
);

export const EQUIPAMENTO_CATEGORIA_SUGESTOES = [
  "Refrigeração",
  "Cocção",
  "Ar-condicionado",
  "Elétrica",
  "Hidráulica",
  "Informática",
  "Mobiliário",
  "Segurança",
];

export const SETOR_SUGESTOES = ["Cozinha", "Salão", "Estoque", "Bar", "Delivery", "Administrativo", "Área externa"];

export function isChamadoOverdue(chamado: { prazo: string | Date | null; status: string }): boolean {
  if (!chamado.prazo) return false;
  if (chamado.status === "RESOLVIDO" || chamado.status === "CANCELADO") return false;
  const prazo = typeof chamado.prazo === "string" ? new Date(chamado.prazo) : chamado.prazo;
  return prazo.getTime() < Date.now();
}

const HISTORICO_ACTION_LABEL: Record<string, string> = {
  CREATED: "criou o chamado",
  STATUS_CHANGED: "alterou o status",
  RESPONSAVEL_CHANGED: "alterou o responsável",
  COMMENTED: "comentou",
  ANEXO_ADICIONADO: "adicionou um anexo",
  MANUTENCAO_REGISTRADA: "registrou uma manutenção",
  RESOLVIDO: "resolveu o chamado",
  ORCAMENTO_ADICIONADO: "adicionou um orçamento",
  ORCAMENTO_APROVADO: "aprovou um orçamento",
  ORCAMENTO_RECUSADO: "recusou um orçamento",
};

export const ORCAMENTO_STATUS_OPTIONS = [
  { key: "RECEBIDO", label: "Recebido", tone: "default" as const },
  { key: "EM_ANALISE", label: "Em análise", tone: "info" as const },
  { key: "APROVADO", label: "Aprovado", tone: "success" as const },
  { key: "RECUSADO", label: "Recusado", tone: "danger" as const },
  { key: "EXPIRADO", label: "Expirado", tone: "default" as const },
];

export const ORCAMENTO_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  ORCAMENTO_STATUS_OPTIONS.map((s) => [s.key, s.label])
);
export const ORCAMENTO_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> =
  Object.fromEntries(ORCAMENTO_STATUS_OPTIONS.map((s) => [s.key, s.tone]));

export function describeChamadoHistoricoAction(action: string): string {
  return HISTORICO_ACTION_LABEL[action] ?? action;
}
