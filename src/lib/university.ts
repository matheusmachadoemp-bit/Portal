export const LEVELS = [
  { key: "BRONZE", label: "Bronze", minXp: 0, color: "#b45309" },
  { key: "PRATA", label: "Prata", minXp: 300, color: "#94a3b8" },
  { key: "OURO", label: "Ouro", minXp: 800, color: "#eab308" },
  { key: "DIAMANTE", label: "Diamante", minXp: 1800, color: "#38bdf8" },
  { key: "MESTRE_NORD", label: "Mestre Nord", minXp: 3500, color: "#a855f7" },
] as const;

export function levelForXp(xp: number) {
  let current: (typeof LEVELS)[number] = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.minXp) current = lvl;
  }
  return current;
}

export function nextLevelForXp(xp: number) {
  const idx = LEVELS.findIndex((l) => l.key === levelForXp(xp).key);
  return LEVELS[idx + 1] ?? null;
}

export const XP_RULES = {
  COURSE_COMPLETED: 100,
  QUIZ_PERFECT_SCORE: 50,
  EXTRA_COURSE: 150,
};

export const MODULE_TYPE_OPTIONS = [
  { key: "VIDEO", label: "Vídeo", icon: "Video" },
  { key: "PDF", label: "PDF", icon: "FileText" },
  { key: "CHECKLIST", label: "Checklist", icon: "ListChecks" },
  { key: "LINK", label: "Link / material complementar", icon: "Link" },
] as const;

export const QUESTION_TYPE_OPTIONS = [
  { key: "MULTIPLA_ESCOLHA", label: "Múltipla escolha" },
  { key: "VERDADEIRO_FALSO", label: "Verdadeiro/Falso" },
  { key: "DISSERTATIVA", label: "Pergunta aberta" },
] as const;

export const COURSE_STATUS_OPTIONS = [
  { key: "RASCUNHO", label: "Rascunho", tone: "default" as const },
  { key: "PUBLICADO", label: "Publicado", tone: "success" as const },
  { key: "ARQUIVADO", label: "Arquivado", tone: "warning" as const },
];

export const ENROLLMENT_STATUS_OPTIONS = [
  { key: "NAO_INICIADO", label: "Não iniciado", tone: "default" as const },
  { key: "EM_ANDAMENTO", label: "Em andamento", tone: "warning" as const },
  { key: "CONCLUIDO", label: "Concluído", tone: "success" as const },
  { key: "REPROVADO", label: "Reprovado", tone: "danger" as const },
];

export const COURSE_CATEGORY_OPTIONS = [
  "Boas-vindas",
  "Cultura",
  "Atendimento",
  "Vendas",
  "Cozinha",
  "Delivery",
  "Segurança Alimentar",
  "Liderança",
  "Processos",
];

export const LIBRARY_CATEGORY_OPTIONS = [
  "POP",
  "Manuais",
  "Receitas",
  "Cardápio",
  "Procedimentos",
  "Documentos",
  "Normas",
];

export const MIN_WATCH_PERCENT_TO_COMPLETE = 95;

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function formatSecondsAsDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
