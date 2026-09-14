import type { FechamentoGravidade, FechamentoOcorrenciaStatus } from "./types";

// ---------------------------------------------------------------------------
// Escala de gravidade — reaproveita a MESMA progressão de cor de
// CHAMADO_PRIORIDADE_OPTIONS (src/lib/manutencao.ts: BAIXA/MEDIA/ALTA/URGENTE =
// #6b7280/#eab308/#f97316/#ef4444) e TASK_PRIORITY_OPTIONS (src/lib/tarefas.ts),
// já usada em Manutenção e Tarefas para o mesmo tipo de decisão ("o quão sério é
// isso?") — de propósito, para não inventar uma paleta nova só para o
// Fechamento do Dia. Ícone próprio por nível (diferente de Chamado/Tarefa) só
// para dar identidade visual ao módulo sem mexer no esquema de cor.
// ---------------------------------------------------------------------------
export const GRAVIDADE_OPTIONS: {
  key: FechamentoGravidade;
  label: string;
  color: string;
  icon: string;
}[] = [
  { key: "INFORMATIVO", label: "Informativo", color: "#6b7280", icon: "Info" },
  { key: "ATENCAO", label: "Atenção", color: "#eab308", icon: "AlertTriangle" },
  { key: "IMPORTANTE", label: "Importante", color: "#f97316", icon: "AlertOctagon" },
  { key: "CRITICO", label: "Crítico", color: "#ef4444", icon: "Siren" },
];

export const GRAVIDADE_LABEL: Record<FechamentoGravidade, string> = Object.fromEntries(
  GRAVIDADE_OPTIONS.map((g) => [g.key, g.label])
) as Record<FechamentoGravidade, string>;

export const GRAVIDADE_COLOR: Record<FechamentoGravidade, string> = Object.fromEntries(
  GRAVIDADE_OPTIONS.map((g) => [g.key, g.color])
) as Record<FechamentoGravidade, string>;

export const GRAVIDADE_ICON: Record<FechamentoGravidade, string> = Object.fromEntries(
  GRAVIDADE_OPTIONS.map((g) => [g.key, g.icon])
) as Record<FechamentoGravidade, string>;

/** Crítico primeiro — usado para ordenar a aba "Em aberto" com o mais urgente no topo. */
export const GRAVIDADE_ORDER: Record<FechamentoGravidade, number> = {
  CRITICO: 0,
  IMPORTANTE: 1,
  ATENCAO: 2,
  INFORMATIVO: 3,
};

// ---------------------------------------------------------------------------
// Status — ABERTA é o único que ainda "precisa de ação"; os outros 3 vão para
// a aba Histórico. Tons reaproveitados do Badge padrão (nenhuma cor nova).
// ---------------------------------------------------------------------------
export const STATUS_LABEL: Record<FechamentoOcorrenciaStatus, string> = {
  ABERTA: "Aberta",
  TRANSFORMADA: "Transformada",
  RESOLVIDA: "Resolvida",
  DESCARTADA: "Descartada",
};

export const STATUS_TONE: Record<FechamentoOcorrenciaStatus, "warning" | "info" | "success" | "default"> = {
  ABERTA: "warning",
  TRANSFORMADA: "info",
  RESOLVIDA: "success",
  DESCARTADA: "default",
};

/** "12/09/2026" — sempre no fuso America/Sao_Paulo (independente do fuso do navegador de quem
 * está olhando), já que `Ocorrencia.data` é persistida como meia-noite America/Sao_Paulo. */
export function formatDataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** "12/09/2026, 21:40" — para os carimbos de transformação/resolução. */
export function formatDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
