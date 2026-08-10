export const KANBAN_COLUMNS = [
  { key: "IDEIA", label: "Ideias", icon: "Lightbulb", color: "#a855f7" },
  { key: "A_PRODUZIR", label: "A Produzir", icon: "Video", color: "#eab308" },
  { key: "EM_PRODUCAO", label: "Em Produção", icon: "Clapperboard", color: "#f97316" },
  { key: "EM_EDICAO", label: "Em Edição", icon: "FileEdit", color: "#3b82f6" },
  { key: "EM_ANALISE", label: "Em Análise", icon: "Eye", color: "#a855f7" },
  { key: "AGENDADO", label: "Agendado", icon: "CalendarClock", color: "#2952E3" },
  { key: "PUBLICADO", label: "Publicado", icon: "CheckCircle2", color: "#22c55e" },
  { key: "RESULTADOS", label: "Resultados", icon: "BarChart3", color: "#14b8a6" },
] as const;

export type MarketingStatusKey = (typeof KANBAN_COLUMNS)[number]["key"];

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  KANBAN_COLUMNS.map((c) => [c.key, c.label])
);

export const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  KANBAN_COLUMNS.map((c) => [c.key, c.color])
);

export const PRIORITY_OPTIONS = [
  { key: "BAIXA", label: "Baixa", color: "#6b7280" },
  { key: "MEDIA", label: "Média", color: "#eab308" },
  { key: "ALTA", label: "Alta", color: "#f97316" },
  { key: "URGENTE", label: "Urgente", color: "#ef4444" },
] as const;

export const PRIORITY_COLOR: Record<string, string> = Object.fromEntries(
  PRIORITY_OPTIONS.map((p) => [p.key, p.color])
);
export const PRIORITY_LABEL: Record<string, string> = Object.fromEntries(
  PRIORITY_OPTIONS.map((p) => [p.key, p.label])
);

export const CATEGORY_OPTIONS = [
  "Pizza",
  "Hambúrguer",
  "Rodízio",
  "Promoção",
  "Institucional",
  "Bastidores",
  "Equipe",
];

export const FORMAT_OPTIONS = ["Reels", "Stories", "Feed", "Vídeo", "Foto", "Anúncio", "Campanha"];

export const SOCIAL_NETWORK_OPTIONS = ["Instagram", "Facebook", "TikTok", "Google", "WhatsApp", "Site", "YouTube"];

export const DEFAULT_CHECKLIST = [
  "Criar roteiro",
  "Gravar",
  "Editar",
  "Aprovação",
  "Criar legenda",
  "Inserir hashtags",
  "Agendar postagem",
  "Publicar",
  "Verificar métricas",
];

export type ChecklistItem = { text: string; done: boolean };

export function parseChecklist(raw: string | null | undefined): ChecklistItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

export function checklistProgress(raw: string | null | undefined): number {
  const items = parseChecklist(raw);
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export const FILE_CATEGORY_OPTIONS = [
  "Fotos",
  "Vídeos",
  "Logos",
  "Cardápio",
  "Promoções",
  "Artes",
  "Campanhas",
  "Reels",
  "Stories",
  "Identidade Visual",
];

export const CAMPAIGN_STATUS_OPTIONS = [
  { key: "PLANEJADA", label: "Planejada", tone: "default" as const },
  { key: "EM_ANDAMENTO", label: "Em Andamento", tone: "info" as const },
  { key: "PAUSADA", label: "Pausada", tone: "warning" as const },
  { key: "CONCLUIDA", label: "Concluída", tone: "success" as const },
];

export const IDEA_STATUS_OPTIONS = [
  { key: "NOVA", label: "Nova", tone: "default" as const },
  { key: "EM_AVALIACAO", label: "Em Avaliação", tone: "info" as const },
  { key: "APROVADA", label: "Aprovada", tone: "success" as const },
  { key: "DESCARTADA", label: "Descartada", tone: "danger" as const },
];
