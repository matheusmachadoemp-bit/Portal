export const GOAL_CATEGORIES = ["GERENCIA", "SALAO", "COZINHA", "DELIVERY", "MARKETING", "ADMINISTRATIVO"] as const;
export type GoalCategoryKey = (typeof GOAL_CATEGORIES)[number];

export const GOAL_CATEGORY_LABEL: Record<GoalCategoryKey, string> = {
  GERENCIA: "Gerência",
  SALAO: "Salão",
  COZINHA: "Cozinha",
  DELIVERY: "Delivery",
  MARKETING: "Marketing",
  ADMINISTRATIVO: "Administrativo",
};

/** Cor padrão de cada setor — usada em qualquer lugar que precise diferenciar setor visualmente (ex.: badge na tabela de checklists). */
export const GOAL_CATEGORY_COLOR: Record<GoalCategoryKey, string> = {
  GERENCIA: "#2952E3",
  SALAO: "#22c55e",
  COZINHA: "#f97316",
  DELIVERY: "#a855f7",
  MARKETING: "#ec4899",
  ADMINISTRATIVO: "#64748b",
};

export const GOAL_CATEGORY_ROUTE: Record<GoalCategoryKey, string> = {
  GERENCIA: "gerencia",
  SALAO: "salao",
  COZINHA: "cozinha",
  DELIVERY: "delivery",
  MARKETING: "marketing",
  ADMINISTRATIVO: "administrativo",
};

/**
 * Metas > Gerência: formulário simplificado — "Responsável" deixa de ser
 * digitado (pedido: "Responsável vai ser sempre o gerente, pois a meta é de
 * gerente") e passa a ser sempre este texto fixo, aplicado tanto no
 * formulário (metas-client.tsx) quanto forçado no servidor (POST/PATCH
 * /api/metas), pra nunca depender só da tela esconder o campo.
 *
 * Decisão: texto fixo "Gerente" (papel/cargo), não o nome de uma pessoa
 * específica — porque uma loja pode ter mais de um usuário com cargo
 * GERENTE (ou nenhum, se ainda não cadastrado), e porque quem cria a meta
 * nem sempre é o próprio gerente (pode ser um ADMINISTRADOR/GESTOR
 * definindo a meta para a loja). Gravar um nome específico exigiria
 * escolher 1 entre N gerentes (ou concatenar vários, o que não cabe bem no
 * campo — ver `<p className="truncate">{g.responsavel}</p>` no card da
 * meta) e ficaria desatualizado se o gerente da loja mudar. Quem
 * efetivamente recebe a notificação de meta nova (ver POST /api/metas) é
 * resolvido à parte, por cargo (GERENTE da loja + ADMINISTRADOR/GESTOR),
 * não a partir deste texto.
 */
export const GERENCIA_RESPONSAVEL = "Gerente";

/**
 * Indicadores fixos do formulário de "Nova meta" de Gerência (pedido:
 * "deixar fixo 3 indicadores relacionados, CMV, Checklist e Faturamento,
 * ter a opção de escrever caso precise de um novo"). `Goal.indicador`
 * continua sendo um `String?` livre no banco — esta lista só guia a UI
 * (select com opção "Outro" liberando texto livre); não é um enum do
 * Prisma, então não precisa de migration pra crescer.
 */
export const GERENCIA_INDICADORES = ["CMV", "Checklist", "Faturamento"] as const;

export const GOAL_STATUS_LABEL: Record<string, string> = {
  NAO_INICIADA: "Não iniciada",
  EM_ANDAMENTO: "Em andamento",
  EM_RISCO: "Próxima de atingir",
  CONCLUIDA: "Concluída",
  NAO_ATINGIDA: "Não atingida",
};

export const GOAL_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  NAO_INICIADA: "default",
  EM_ANDAMENTO: "info",
  EM_RISCO: "warning",
  CONCLUIDA: "success",
  NAO_ATINGIDA: "danger",
};

/**
 * Toda meta vale por um mês inteiro (dia 1 ao último dia). Esses helpers
 * convertem entre o "YYYY-MM" do seletor de mês e as datas de início/fim
 * que o Goal guarda no banco.
 */
export function monthToDateRange(month: string): { startDate: string; endDate: string } {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startDate: `${year}-${pad(monthIdx + 1)}-01`,
    endDate: `${year}-${pad(monthIdx + 1)}-${pad(lastDay)}`,
  };
}

/**
 * Extrai "YYYY-MM" de uma data. Os dois formatos de entrada são tratados de
 * propósito de forma diferente — não é um descuido:
 *
 * - `string` (o formato em que toda data de `Goal` chega do `GET
 *   /api/metas`, já serializada em JSON): essa data foi originalmente
 *   codificada por `monthToDateRange` como "YYYY-MM-01"/"YYYY-MM-DD", uma
 *   string SEM horário — pela especificação do JavaScript, uma string de
 *   data "pura" (sem horário) é sempre interpretada como meia-noite UTC na
 *   hora de virar `Date` (tanto no `POST`/`PATCH /api/metas`, no servidor,
 *   quanto aqui no navegador). Por isso, pra reverter essa codificação e
 *   recuperar o mesmo "YYYY-MM" original, usamos os getters UTC
 *   (`getUTCFullYear`/`getUTCMonth`) — getters locais aqui fariam a conta
 *   variar com o fuso horário de quem está vendo a tela: num fuso atrás de
 *   UTC (ex.: Brasil, UTC-3), meia-noite UTC do dia 1 vira ~21h do dia 31 do
 *   mês ANTERIOR em hora local, e uma meta recém-criada para o mês corrente
 *   passava a "pertencer" ao mês anterior assim que voltava do servidor —
 *   sumindo da listagem do mês corrente (`goalsOfMonth`) imediatamente após
 *   ser criada. Esse era o bug relatado: "crio uma meta nova e ela não
 *   aparece em Metas".
 * - `Date` (usado só por `currentMonth()`, com `new Date()` = "agora"): aqui
 *   o que importa é o mês corrente no calendário LOCAL de quem está vendo a
 *   tela (ex.: `mesFiltro`/`form.mes` default em metas-client.tsx), então os
 *   getters locais continuam certos — nunca troque este ramo para UTC.
 */
export function dateToMonth(date: string | Date): string {
  if (typeof date === "string") {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(): string {
  return dateToMonth(new Date());
}

/**
 * Quantas "semanas" (blocos de até 7 dias, contados a partir do dia 1 do
 * período da meta) cabem no período de uma meta — sempre 4 ou 5, já que toda
 * `Goal` vale por um mês calendário inteiro (28 a 31 dias). Usado tanto para
 * validar `GoalWeeklyUpdate.weekNumber` (nunca pode passar desse total) quanto
 * para a tela (Caio) montar os cards/inputs de cada semana do mês.
 */
export function weeksInGoalPeriod(startDate: Date, endDate: Date): number {
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  return Math.max(1, Math.ceil(totalDays / 7));
}

/**
 * Intervalo de dias (base 1, relativo ao início do período da meta) de uma
 * semana específica — ex.: semana 2 de um mês de 30 dias = dias 8 a 14; a
 * última semana do mês pode ter menos de 7 dias (ex.: semana 5 de um mês de
 * 31 dias = só o dia 29 a 31, 3 dias).
 */
export function weekDayRange(weekNumber: number, totalDays: number): { startDay: number; endDay: number } {
  const startDay = (weekNumber - 1) * 7 + 1;
  const endDay = Math.min(weekNumber * 7, totalDays);
  return { startDay, endDay };
}

const NEAR_TARGET_THRESHOLD = 90;

/**
 * A meta muda de status automaticamente conforme o progresso e o prazo —
 * ver seção 1 do escopo (o status nunca é escolhido manualmente).
 */
export function computeGoalStatus(
  valorRealizado: number,
  valorMeta: number,
  endDate: Date,
  now: Date = new Date()
): keyof typeof GOAL_STATUS_LABEL {
  const percent = valorMeta > 0 ? (valorRealizado / valorMeta) * 100 : 0;
  if (percent >= 100) return "CONCLUIDA";
  if (now.getTime() > endDate.getTime()) return "NAO_ATINGIDA";
  if (percent >= NEAR_TARGET_THRESHOLD) return "EM_RISCO";
  if (valorRealizado > 0) return "EM_ANDAMENTO";
  return "NAO_INICIADA";
}
