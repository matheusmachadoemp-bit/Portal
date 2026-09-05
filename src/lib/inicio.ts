import { prisma } from "@/lib/prisma";
import { pct, safeDiv } from "@/lib/calc";
import { resolveCrmPeriod, type CrmPeriodKey } from "@/lib/crm";
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, format } from "date-fns";
import {
  spDateKey,
  spStartOfDay,
  computeOccurrenceStatus,
  dueEscalationLevels,
  CHECKLIST_TERMINAL_STATUSES,
  CHECKLIST_PONTOS_POR_CONCLUSAO,
} from "@/lib/checklist";
import { generateChecklistOccurrences, refreshOccurrenceStatuses } from "@/lib/checklist-server";
import { isTaskOverdue, effectiveTaskStatus } from "@/lib/tarefas";
import { generateDueTaskOccurrences } from "@/lib/tarefas-server";
import { computeGoalStatus, GOAL_CATEGORY_LABEL, GOAL_CATEGORY_ROUTE } from "@/lib/goals";

// ---------------------------------------------------------------------------
// Perfil da Tela de Início — mapeia o enum `Role` (login/permissões) para o
// perfil usado só para decidir qual painel de Início mostrar a cada usuário.
// Não existe um valor de Role "LIDER": quem enxerga o painel de Líder é o
// SUPERVISOR. GESTOR e GERENTE caem os dois no painel de Gerente.
// ---------------------------------------------------------------------------

export type PerfilInicio = "PROPRIETARIO" | "GERENTE" | "LIDER" | "COLABORADOR";

export function perfilInicioForRole(role: string): PerfilInicio {
  switch (role) {
    case "ADMINISTRADOR":
      return "PROPRIETARIO";
    case "GESTOR":
    case "GERENTE":
      return "GERENTE";
    case "SUPERVISOR":
      return "LIDER";
    case "COLABORADOR":
    default:
      return "COLABORADOR";
  }
}

/** Painéis desta etapa (indicadores + desempenho da loja) são só para Proprietário e Gerente. */
export function perfilPodeVerPainelGerencial(perfil: PerfilInicio): boolean {
  return perfil === "PROPRIETARIO" || perfil === "GERENTE";
}

// ---------------------------------------------------------------------------
// Período — as rotas de /api/inicio/* usam as chaves "hoje" | "7dias" | "mes"
// | "custom". Em vez de reinventar a lógica de datas, reaproveitamos
// `resolveCrmPeriod` (src/lib/crm.ts), que já resolve exatamente essas
// mesmas janelas (inclusive "7dias", que src/lib/periods.ts não tem) e a
// comparação com o período anterior equivalente. "custom" é só um apelido
// para a chave "personalizado" dessa mesma função.
// ---------------------------------------------------------------------------

export type PeriodoInicio = "hoje" | "7dias" | "mes" | "custom";

export type RangeComparativo = { from: Date; to: Date; prevFrom: Date; prevTo: Date };

function normalizePeriodoInicio(periodo?: string | null): PeriodoInicio {
  if (periodo === "hoje" || periodo === "7dias" || periodo === "mes" || periodo === "custom") return periodo;
  return "mes";
}

/** "YYYY-MM-DD" (ou datetime ISO) válido, ou undefined se vazio/ilegível. */
function parseIsoDateParam(value?: string | null): string | undefined {
  if (!value) return undefined;
  return Number.isNaN(new Date(value).getTime()) ? undefined : value;
}

/**
 * Resolve a janela [from, to] pedida por uma rota de /api/inicio/* e a janela
 * equivalente anterior (para o `variacaoPercent` de cada indicador). Retorna
 * também `chave`, a chave efetivamente aplicada — cai para "mes" se
 * `periodo` vier vazio/inválido, ou se "custom" vier sem `inicio`/`fim`
 * válidos (mesmo fallback que `resolveCrmPeriod` já faz para
 * "personalizado" sem `custom.from`/`custom.to`).
 */
export function resolvePeriodoInicio(
  periodoInput: string | null | undefined,
  custom?: { inicio?: string | null; fim?: string | null }
): RangeComparativo & { chave: PeriodoInicio } {
  let periodo = normalizePeriodoInicio(periodoInput);
  const inicio = parseIsoDateParam(custom?.inicio);
  const fim = parseIsoDateParam(custom?.fim);
  if (periodo === "custom" && !(inicio && fim)) {
    periodo = "mes";
  }

  const crmKey: CrmPeriodKey = periodo === "custom" ? "personalizado" : periodo;
  const range = resolveCrmPeriod(crmKey, { from: inicio, to: fim });
  return { chave: periodo, ...range };
}

// ---------------------------------------------------------------------------
// Faturamento / pedidos / ticket médio — mesma agregação de SalesEntry usada
// em getData() de src/app/portal/inicio/page.tsx (fatMes/pedidosMes/
// ticketMedio), só generalizada para uma empresa e um intervalo quaisquer em
// vez do mês fixo.
// ---------------------------------------------------------------------------

export async function loadSalesSummary(
  empresaId: string,
  from: Date,
  to: Date
): Promise<{ faturamento: number; pedidos: number; ticketMedio: number }> {
  const rows = await prisma.salesEntry.findMany({
    where: { empresaId, date: { gte: from, lte: to } },
    select: {
      faturamentoDelivery: true,
      faturamentoSalao: true,
      pedidosDelivery: true,
      pedidosBalcao: true,
      pedidosSalao: true,
    },
  });

  const faturamento = rows.reduce((acc, r) => acc + r.faturamentoDelivery + r.faturamentoSalao, 0);
  const pedidos = rows.reduce((acc, r) => acc + r.pedidosDelivery + r.pedidosBalcao + r.pedidosSalao, 0);
  return { faturamento, pedidos, ticketMedio: safeDiv(faturamento, pedidos) };
}

// ---------------------------------------------------------------------------
// Progresso da meta mensal — sempre o mês corrente (não muda com o período
// selecionado no painel: "% da meta do mês" não faz sentido recalculado só
// para "hoje", por exemplo). Reaproveita exatamente a conta de
// src/app/portal/inicio/page.tsx: soma de `metaDiaria` dos lançamentos do
// mês, com fallback de R$ 130.000 quando nenhum lançamento do mês tem meta
// cadastrada.
// ---------------------------------------------------------------------------

export async function loadProgressoMeta(
  empresaId: string
): Promise<{ percentual: number; faturamentoMes: number; metaMensal: number }> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const entries = await prisma.salesEntry.findMany({
    where: { empresaId, date: { gte: monthStart, lte: monthEnd } },
    select: { faturamentoDelivery: true, faturamentoSalao: true, metaDiaria: true },
  });

  const faturamentoMes = entries.reduce((acc, e) => acc + e.faturamentoDelivery + e.faturamentoSalao, 0);
  const metaMensal = entries.reduce((acc, e) => acc + e.metaDiaria, 0) || 130000;
  return { percentual: pct(faturamentoMes, metaMensal), faturamentoMes, metaMensal };
}

// ---------------------------------------------------------------------------
// NPS — mesma classificação (promotor/neutro/detrator, notas 9-10 / 7-8 / 0-6)
// e fórmula ((promotores - detratores) / total) * 100 usadas em
// src/app/portal/crm/satisfacao/page.tsx.
// ---------------------------------------------------------------------------

function classifyNps(nota: number): "promotor" | "neutro" | "detrator" {
  if (nota >= 9) return "promotor";
  if (nota >= 7) return "neutro";
  return "detrator";
}

export function npsScore(notas: number[]): number {
  if (notas.length === 0) return 0;
  let promotores = 0;
  let detratores = 0;
  for (const nota of notas) {
    const c = classifyNps(nota);
    if (c === "promotor") promotores++;
    else if (c === "detrator") detratores++;
  }
  return ((promotores - detratores) / notas.length) * 100;
}

export async function loadNpsScore(empresaId: string, from: Date, to: Date): Promise<number> {
  const respostas = await prisma.npsResponse.findMany({
    where: { empresaId, createdAt: { gte: from, lte: to } },
    select: { nota: true },
  });
  return npsScore(respostas.map((r) => r.nota));
}

// ---------------------------------------------------------------------------
// Checklists concluídos no período — soma os dois status "concluído" do
// enum ChecklistOccurrenceStatus (ver src/lib/checklist.ts): no prazo e com
// atraso. Não conta AGENDADO/DISPONIVEL/EM_ANDAMENTO/ATRASADO/
// NAO_REALIZADO/JUSTIFICADO/CANCELADO.
// ---------------------------------------------------------------------------

export async function countChecklistsConcluidos(empresaId: string, from: Date, to: Date): Promise<number> {
  return prisma.checklistOccurrence.count({
    where: {
      empresaId,
      date: { gte: from, lte: to },
      status: { in: ["CONCLUIDO_NO_PRAZO", "CONCLUIDO_COM_ATRASO"] },
    },
  });
}

// ---------------------------------------------------------------------------
// Tarefas pendentes agora — backlog atual (não filtrado por período), mesmo
// critério de "não concluída" usado em src/app/api/tarefas/route.ts
// (`status: { not: "CONCLUIDA" }`, que inclui PENDENTE, EM_ANDAMENTO e
// AGUARDANDO_VALIDACAO — inclusive as "atrasadas", que são um status
// derivado e nunca gravado como CONCLUIDA).
// ---------------------------------------------------------------------------

export async function countTarefasPendentes(empresaId: string): Promise<number> {
  return prisma.task.count({ where: { empresaId, status: { not: "CONCLUIDA" } } });
}

// ---------------------------------------------------------------------------
// Equipe presente hoje — quem bateu ponto (tem `entrada` registrada e não
// está marcado `falta`) hoje nesta loja. Sempre "hoje", independente do
// período selecionado no painel.
// ---------------------------------------------------------------------------

export async function countEquipePresenteHoje(empresaId: string): Promise<number> {
  const now = new Date();
  return prisma.timeEntry.count({
    where: {
      empresaId,
      date: { gte: startOfDay(now), lte: endOfDay(now) },
      falta: false,
      entrada: { not: null },
    },
  });
}

// ---------------------------------------------------------------------------
// Mini-série de 7 dias corridos (gráfico do painel de desempenho da loja) —
// sempre os últimos 7 dias a partir de hoje, independente do período
// selecionado no restante do painel. `data` sai em "YYYY-MM-DD" (ISO), sem
// depender de locale — formatação de exibição (ex. "dd/MM") é decisão de UI.
// ---------------------------------------------------------------------------

export async function loadSerieDiaria7Dias(empresaId: string): Promise<{ data: string; faturamento: number }[]> {
  const now = new Date();
  const from = startOfDay(subDays(now, 6));
  const to = endOfDay(now);

  const entries = await prisma.salesEntry.findMany({
    where: { empresaId, date: { gte: from, lte: to } },
    select: { date: true, faturamentoDelivery: true, faturamentoSalao: true },
  });

  const porDia = new Map<string, number>();
  for (const e of entries) {
    const key = format(e.date, "yyyy-MM-dd");
    porDia.set(key, (porDia.get(key) ?? 0) + e.faturamentoDelivery + e.faturamentoSalao);
  }

  return Array.from({ length: 7 }, (_, idx) => {
    const dia = subDays(to, 6 - idx);
    const key = format(dia, "yyyy-MM-dd");
    return { data: key, faturamento: porDia.get(key) ?? 0 };
  });
}

// ---------------------------------------------------------------------------
// Helpers de data/texto compartilhados por "rotina" e "alertas" (Fase 1b)
// ---------------------------------------------------------------------------

/** Quantos dias de antecedência/atraso já contam como "urgente" nas heurísticas abaixo (metas e aprovações pendentes). Ajustável sem migração. */
const DIAS_LIMITE_URGENTE = 3;

/** "HH:mm" em São Paulo a partir de um instante — mesmo offset fixo (UTC-3, sem horário de verão) de `spDateKey` em src/lib/checklist.ts. */
function formatSpHm(date: Date): string {
  const spTime = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return spTime.toISOString().slice(11, 16);
}

/** Diferença em dias corridos (arredondada), positiva quando `ate` é depois de `de`. */
function diasEntre(de: Date, ate: Date): number {
  return Math.round((ate.getTime() - de.getTime()) / 86400000);
}

/** "3h" ou "2 dias" a partir de uma duração em milissegundos (sempre positiva nos usos abaixo) — texto pronto para os alertas. */
function formatDuracao(ms: number): string {
  const horas = ms / 3600000;
  if (horas < 24) return `${Math.max(1, Math.round(horas))}h`;
  const dias = Math.max(1, Math.round(horas / 24));
  return `${dias} dia${dias > 1 ? "s" : ""}`;
}

/** "vence hoje" | "vence em N dia(s)" | "atrasado há X" a partir de uma data-alvo (prazo) — texto pronto para os alertas. */
function describePrazoText(alvo: Date, now: Date): string {
  const diffMs = alvo.getTime() - now.getTime();
  if (diffMs < 0) return `atrasado há ${formatDuracao(-diffMs)}`;
  const dias = Math.ceil(diffMs / 86400000);
  return dias <= 0 ? "vence hoje" : `vence em ${dias} dia${dias > 1 ? "s" : ""}`;
}

/**
 * Progresso de uma meta comparado ao tempo já decorrido do próprio período
 * dela (`startDate`/`endDate` da meta, não o mês calendário): % do prazo já
 * decorrido vs. % da meta já atingida. Usada tanto pelo alerta do gestor
 * quanto pela meta individual do colaborador na rotina — a mesma conta
 * pedida na Fase 1b para os dois casos.
 */
export function goalPace(
  goal: { valorMeta: number; valorRealizado: number; startDate: Date; endDate: Date },
  now: Date = new Date()
): { percentTempo: number; percentMeta: number; abaixoDoRitmo: boolean } {
  const totalMs = goal.endDate.getTime() - goal.startDate.getTime();
  const elapsedMs = now.getTime() - goal.startDate.getTime();
  const percentTempo = totalMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) : 100;
  const percentMeta = goal.valorMeta > 0 ? (goal.valorRealizado / goal.valorMeta) * 100 : 0;
  return { percentTempo, percentMeta, abaixoDoRitmo: percentMeta < percentTempo };
}

// ---------------------------------------------------------------------------
// "Minha rotina de hoje" (GET /api/inicio/rotina) — diferente dos painéis
// acima (só Proprietário/Gerente), esta agregação é para QUALQUER perfil
// logado: cada um só vê o que está atribuído a si mesmo, na loja pedida.
// Junta num único formato Tarefas, Checklist, Metas individuais e Pesquisas
// de satisfação pendentes.
//
// "Reuniões" (KitchenMeeting/SalaoMeeting/DeliveryMeeting/GerenteMeeting)
// fica de fora de propósito: essas 4 tabelas são um formulário de fechamento
// MENSAL (`periodo`: "YYYY-MM"), sem nenhum campo de dia/hora agendado nem
// de "responsável" — só `createdById`, que é quem preencheu o formulário, a
// qualquer momento dentro do mês. Não existe "reunião marcada para hoje"
// para filtrar sem inventar uma regra de negócio nova (ex.: "sempre lembrar
// no último dia do mês"); preferimos deixar de fora a confirmar com o líder
// do que inventar esse critério.
// ---------------------------------------------------------------------------

export type RotinaItemTipo = "tarefa" | "checklist" | "reuniao" | "meta" | "pesquisa";

export type RotinaItem = {
  tipo: RotinaItemTipo;
  horario: string | null;
  titulo: string;
  descricao: string | null;
  loja: string;
  setor: string | null;
  responsavel: string;
  prioridade: "URGENTE" | "ALTA" | "MEDIA" | "BAIXA" | null;
  status: string;
  prazo: string | null;
  atrasado: boolean;
  pontos: number | null;
  actionHref: string;
};

/** Tarefas atribuídas ao usuário com prazo hoje ou já vencido — mesmo critério de "não concluída" do resto do módulo de Tarefas (src/lib/tarefas.ts). */
export async function loadRotinaTarefas(
  empresaId: string,
  userId: string,
  nomeLoja: string,
  nomeUsuario: string,
  now: Date = new Date()
): Promise<RotinaItem[]> {
  await generateDueTaskOccurrences([empresaId], now);

  const tasks = await prisma.task.findMany({
    where: {
      empresaId,
      status: { not: "CONCLUIDA" },
      dueDate: { lte: endOfDay(now) },
      assignees: { some: { userId } },
    },
    orderBy: { dueDate: "asc" },
  });

  return tasks.map(
    (t): RotinaItem => ({
      tipo: "tarefa",
      horario: t.dueTime,
      titulo: t.title,
      descricao: t.description,
      loja: nomeLoja,
      setor: t.sectorKey,
      responsavel: nomeUsuario,
      prioridade: t.priority,
      status: effectiveTaskStatus({ status: t.status, dueDate: t.dueDate }),
      prazo: t.dueDate ? t.dueDate.toISOString() : null,
      atrasado: isTaskOverdue({ status: t.status, dueDate: t.dueDate }),
      pontos: null,
      actionHref: "/portal/tarefas",
    })
  );
}

/**
 * Ocorrências de checklist de hoje onde o usuário é o responsável OU o
 * substituto configurado no template (`ChecklistTemplate.substitutoId`),
 * ainda não concluídas/encerradas. Reaproveita a mesma geração/atualização
 * de status de src/app/api/checklist/occurrences/route.ts.
 */
export async function loadRotinaChecklist(
  empresaId: string,
  userId: string,
  nomeLoja: string,
  nomeUsuario: string,
  now: Date = new Date()
): Promise<RotinaItem[]> {
  const dateKey = spDateKey(now);
  await generateChecklistOccurrences([empresaId], dateKey);
  const day = spStartOfDay(dateKey);

  const occurrences = await prisma.checklistOccurrence.findMany({
    where: {
      empresaId,
      date: day,
      OR: [{ responsavelId: userId }, { template: { substitutoId: userId } }],
    },
    include: { template: { select: { name: true, description: true, setor: true } } },
  });
  if (occurrences.length === 0) return [];

  await refreshOccurrenceStatuses(occurrences.map((o) => o.id));

  return occurrences
    .map((o) => ({
      o,
      liveStatus: computeOccurrenceStatus({
        releaseAt: o.releaseAt,
        dueAt: o.dueAt,
        startedAt: o.startedAt,
        completedAt: o.completedAt,
        currentStatus: o.status,
        now,
      }),
    }))
    .filter(({ liveStatus }) => !CHECKLIST_TERMINAL_STATUSES.includes(liveStatus))
    .map(
      ({ o, liveStatus }): RotinaItem => ({
        tipo: "checklist",
        horario: formatSpHm(o.dueAt),
        titulo: o.template.name,
        descricao: o.template.description,
        loja: nomeLoja,
        setor: GOAL_CATEGORY_LABEL[o.template.setor] ?? o.template.setor,
        responsavel: nomeUsuario,
        prioridade: null,
        status: liveStatus,
        prazo: o.dueAt.toISOString(),
        atrasado: liveStatus === "ATRASADO",
        pontos: CHECKLIST_PONTOS_POR_CONCLUSAO,
        actionHref: `/portal/tarefas/checklist/executar/${o.id}`,
      })
    );
}

/**
 * Metas individuais do usuário do período corrente, incluídas só quando
 * abaixo do ritmo esperado, perto do prazo (até `DIAS_LIMITE_URGENTE` dias)
 * ou já vencidas sem terem sido atingidas.
 *
 * `Goal.responsavel` é campo de texto livre — não existe relação com
 * `User`/`Employee` no schema hoje —, então o cruzamento é por igualdade de
 * nome (sem diferenciar maiúsculas/minúsculas) com `session.user.name`; não
 * bate se o nome digitado na meta divergir do nome de cadastro do usuário
 * (apelido, sobrenome a menos, etc.).
 */
export async function loadRotinaMetas(
  empresaId: string,
  nomeLoja: string,
  nomeUsuario: string,
  now: Date = new Date()
): Promise<RotinaItem[]> {
  if (!nomeUsuario.trim()) return [];

  const goals = await prisma.goal.findMany({
    where: {
      empresaId,
      responsavel: { equals: nomeUsuario, mode: "insensitive" },
      startDate: { lte: now },
      endDate: { gte: subDays(now, DIAS_LIMITE_URGENTE) },
    },
  });

  const itens: RotinaItem[] = [];
  for (const g of goals) {
    const pace = goalPace(g, now);
    if (pace.percentMeta >= 100) continue;

    const atrasado = g.endDate.getTime() < now.getTime();
    const pertoDoPrazo = !atrasado && diasEntre(now, g.endDate) <= DIAS_LIMITE_URGENTE;
    if (!atrasado && !pace.abaixoDoRitmo && !pertoDoPrazo) continue;

    itens.push({
      tipo: "meta",
      horario: null,
      titulo: g.name,
      descricao: g.description,
      loja: nomeLoja,
      setor: GOAL_CATEGORY_LABEL[g.category] ?? g.category,
      responsavel: nomeUsuario,
      prioridade: null,
      status: computeGoalStatus(g.valorRealizado, g.valorMeta, g.endDate, now),
      prazo: g.endDate.toISOString(),
      atrasado,
      pontos: null,
      actionHref: `/portal/metas/${GOAL_CATEGORY_ROUTE[g.category] ?? ""}`,
    });
  }
  return itens;
}

/**
 * Convites de pesquisa de satisfação ainda não respondidos pelo usuário.
 * Convites são por `Employee`, não por `User` — o colaborador responde por
 * link com token, sem precisar logar (ver
 * src/app/api/satisfaction/responder/[token]/route.ts) — e não existe
 * relação direta `User`<->`Employee` no schema. O cruzamento aqui é por
 * e-mail (`Employee.email` = `session.user.email`, sem diferenciar
 * maiúsculas/minúsculas); usuários sem um cadastro de colaborador com o
 * mesmo e-mail (ex.: administradores sem ficha de RH) nunca verão pesquisas
 * aqui.
 */
export async function loadRotinaPesquisas(
  empresaId: string,
  emailUsuario: string,
  nomeLoja: string,
  nomeUsuario: string,
  now: Date = new Date()
): Promise<RotinaItem[]> {
  if (!emailUsuario.trim()) return [];

  const employee = await prisma.employee.findFirst({
    where: { empresaId, status: "ATIVO", email: { equals: emailUsuario, mode: "insensitive" } },
    select: { id: true, setor: true },
  });
  if (!employee) return [];

  const convites = await prisma.satisfactionInvitation.findMany({
    where: {
      employeeId: employee.id,
      respondido: false,
      survey: { status: { in: ["PROGRAMADA", "EM_ANDAMENTO"] }, endDate: { gte: now } },
    },
    include: { survey: { select: { title: true, description: true, status: true, endDate: true } } },
  });

  return convites.map(
    (c): RotinaItem => ({
      tipo: "pesquisa",
      horario: null,
      titulo: c.survey.title,
      descricao: c.survey.description,
      loja: nomeLoja,
      setor: employee.setor,
      responsavel: nomeUsuario,
      prioridade: null,
      status: c.survey.status,
      prazo: c.survey.endDate.toISOString(),
      atrasado: false,
      pontos: null,
      actionHref: `/pesquisa/${c.token}`,
    })
  );
}

/**
 * Ordena a lista combinada da rotina: 1º atrasadas, 2º prioridade urgente,
 * 3º pelo horário/prazo mais próximo (horário de hoje quando existir, senão
 * o `prazo` bruto), 4º as demais — preservando a ordem relativa dentro de
 * cada critério.
 */
export function sortRotinaItems(itens: RotinaItem[], now: Date = new Date()): RotinaItem[] {
  const instant = (item: RotinaItem): number => {
    if (item.horario) {
      const [h, m] = item.horario.split(":").map(Number);
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      return d.getTime();
    }
    return item.prazo ? new Date(item.prazo).getTime() : Number.POSITIVE_INFINITY;
  };

  return itens
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.atrasado !== b.item.atrasado) return a.item.atrasado ? -1 : 1;
      const aUrgente = a.item.prioridade === "URGENTE";
      const bUrgente = b.item.prioridade === "URGENTE";
      if (aUrgente !== bUrgente) return aUrgente ? -1 : 1;
      const diff = instant(a.item) - instant(b.item);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map(({ item }) => item);
}

// ---------------------------------------------------------------------------
// "Alertas importantes" (GET /api/inicio/alertas) — só Proprietário/Gerente/
// Líder (`perfilPodeVerAlertas`, diferente de `perfilPodeVerPainelGerencial`:
// esta tela também é do Líder, não só Proprietário/Gerente).
//
// Cobre: checklist atrasado, tarefa vencida, meta abaixo do ritmo, estoque
// abaixo do mínimo, avaliação negativa de cliente e aprovação pendente
// (Tarefa aguardando validação + Resgate Loja Nord + Contagem de estoque).
//
// "Curso obrigatório vencendo" NÃO está implementado: `TrainingCourse.
// mandatory` existe, mas nem ele, nem `TrainingEnrollment`, nem
// `TrainingCertificate` têm qualquer campo de prazo/validade no schema —
// não dá pra calcular "vencendo" sem inventar uma regra de negócio nova
// (ex.: "N dias após a matrícula"). Módulo de manutenção/equipamento não
// existe no escopo deste alerta (instrução explícita da tarefa).
// ---------------------------------------------------------------------------

export function perfilPodeVerAlertas(perfil: PerfilInicio): boolean {
  return perfil !== "COLABORADOR";
}

export type AlertaTipo =
  | "checklist_atrasado"
  | "tarefa_vencida"
  | "meta_abaixo_ritmo"
  | "estoque_baixo"
  | "avaliacao_negativa"
  | "aprovacao_pendente";

export type AlertaNivel = "urgente" | "atencao" | "informativo";

export type AlertaItem = {
  tipo: AlertaTipo;
  titulo: string;
  loja: string;
  setor: string | null;
  tempoAtrasoOuPrazo: string;
  nivel: AlertaNivel;
  actionHref: string;
};

/**
 * Ocorrências de checklist de hoje já com status ATRASADO. O nível
 * (urgente/atenção) reaproveita os mesmos limiares de escalonamento do
 * template (`dueEscalationLevels`, de src/lib/checklist.ts) em vez de
 * inventar um novo corte.
 */
export async function loadAlertaChecklistAtrasado(
  empresaId: string,
  nomeLoja: string,
  now: Date = new Date()
): Promise<AlertaItem[]> {
  const dateKey = spDateKey(now);
  await generateChecklistOccurrences([empresaId], dateKey);
  const day = spStartOfDay(dateKey);

  const occurrences = await prisma.checklistOccurrence.findMany({
    where: { empresaId, date: day },
    include: { template: true },
  });
  if (occurrences.length === 0) return [];

  await refreshOccurrenceStatuses(occurrences.map((o) => o.id));

  const alertas: AlertaItem[] = [];
  for (const o of occurrences) {
    const liveStatus = computeOccurrenceStatus({
      releaseAt: o.releaseAt,
      dueAt: o.dueAt,
      startedAt: o.startedAt,
      completedAt: o.completedAt,
      currentStatus: o.status,
      now,
    });
    if (liveStatus !== "ATRASADO") continue;

    const levels = dueEscalationLevels({
      dueAt: o.dueAt,
      completedAt: o.completedAt,
      currentStatus: liveStatus,
      avisoAntesMinutos: o.template.avisoAntesMinutos,
      avisoAtrasoResponsavelMinutos: o.template.avisoAtrasoResponsavelMinutos,
      alertaCriticoMinutos: o.template.alertaCriticoMinutos,
      naoRealizadoMinutos: o.template.naoRealizadoMinutos,
      now,
    });

    alertas.push({
      tipo: "checklist_atrasado",
      titulo: o.template.name,
      loja: nomeLoja,
      setor: GOAL_CATEGORY_LABEL[o.template.setor] ?? o.template.setor,
      tempoAtrasoOuPrazo: `atrasado há ${formatDuracao(now.getTime() - o.dueAt.getTime())}`,
      nivel: levels.includes("ALERTA_CRITICO") || levels.includes("NAO_REALIZADO") ? "urgente" : "atencao",
      actionHref: `/portal/tarefas/checklist/executar/${o.id}`,
    });
  }
  return alertas;
}

/**
 * Tarefas vencidas em que ainda ninguém está trabalhando (`PENDENTE` ou
 * `EM_ANDAMENTO`) — exclui `AGUARDANDO_VALIDACAO` de propósito, porque essas
 * já aparecem em "aprovação pendente" (já foram comprovadas, só falta o
 * gestor validar).
 */
export async function loadAlertaTarefaVencida(
  empresaId: string,
  nomeLoja: string,
  now: Date = new Date()
): Promise<AlertaItem[]> {
  await generateDueTaskOccurrences([empresaId], now);

  const tasks = await prisma.task.findMany({
    where: { empresaId, status: { in: ["PENDENTE", "EM_ANDAMENTO"] }, dueDate: { lt: now } },
    orderBy: { dueDate: "asc" },
  });

  return tasks.map((t): AlertaItem => {
    const dueDate = t.dueDate as Date;
    return {
      tipo: "tarefa_vencida",
      titulo: t.title,
      loja: nomeLoja,
      setor: t.sectorKey,
      tempoAtrasoOuPrazo: `atrasado há ${formatDuracao(now.getTime() - dueDate.getTime())}`,
      nivel: t.priority === "URGENTE" || t.priority === "ALTA" ? "urgente" : "atencao",
      actionHref: "/portal/tarefas",
    };
  });
}

/** Metas em andamento (dentro do próprio período) cujo progresso está abaixo do % do prazo já decorrido — ver `goalPace`. */
export async function loadAlertaMetaAbaixoRitmo(
  empresaId: string,
  nomeLoja: string,
  now: Date = new Date()
): Promise<AlertaItem[]> {
  const goals = await prisma.goal.findMany({
    where: { empresaId, startDate: { lte: now }, endDate: { gte: now } },
  });

  const alertas: AlertaItem[] = [];
  for (const g of goals) {
    const pace = goalPace(g, now);
    if (pace.percentMeta >= 100 || !pace.abaixoDoRitmo) continue;

    alertas.push({
      tipo: "meta_abaixo_ritmo",
      titulo: `${g.name} — ${g.responsavel}`,
      loja: nomeLoja,
      setor: GOAL_CATEGORY_LABEL[g.category] ?? g.category,
      tempoAtrasoOuPrazo: describePrazoText(g.endDate, now),
      nivel: diasEntre(now, g.endDate) <= DIAS_LIMITE_URGENTE ? "urgente" : "atencao",
      actionHref: `/portal/metas/${GOAL_CATEGORY_ROUTE[g.category] ?? ""}`,
    });
  }
  return alertas;
}

/** Insumos ativos com `estoqueAtual` abaixo de `estoqueMinimo` (só considera quem tem mínimo cadastrado, isto é, > 0). */
export async function loadAlertaEstoqueBaixo(empresaId: string, nomeLoja: string): Promise<AlertaItem[]> {
  const ingredientes = await prisma.ingredient.findMany({
    where: { empresaId, active: true, estoqueMinimo: { gt: 0 } },
  });

  return ingredientes
    .filter((i) => i.estoqueAtual < i.estoqueMinimo)
    .map(
      (i): AlertaItem => ({
        tipo: "estoque_baixo",
        titulo: `Estoque baixo: ${i.name}`,
        loja: nomeLoja,
        setor: i.setor,
        tempoAtrasoOuPrazo: `estoque atual: ${i.estoqueAtual}${i.unidade} (mínimo: ${i.estoqueMinimo}${i.unidade})`,
        nivel: i.estoqueAtual <= 0 ? "urgente" : "atencao",
        actionHref: "/portal/estoque/produtos",
      })
    );
}

/** Respostas de NPS de detrator (nota ≤ 6) dos últimos 7 dias que ainda não foram marcadas como resolvidas (`NpsResponse.status`). */
export async function loadAlertaAvaliacaoNegativa(
  empresaId: string,
  nomeLoja: string,
  now: Date = new Date()
): Promise<AlertaItem[]> {
  const respostas = await prisma.npsResponse.findMany({
    where: { empresaId, createdAt: { gte: subDays(now, 7) }, nota: { lte: 6 }, status: { not: "RESOLVIDO" } },
    include: { cliente: { select: { nome: true } } },
    orderBy: { createdAt: "desc" },
  });

  return respostas.map(
    (r): AlertaItem => ({
      tipo: "avaliacao_negativa",
      titulo: `Avaliação negativa (nota ${r.nota})${r.cliente?.nome ? ` — ${r.cliente.nome}` : ""}`,
      loja: nomeLoja,
      setor: null,
      tempoAtrasoOuPrazo: `recebida há ${formatDuracao(now.getTime() - r.createdAt.getTime())}`,
      nivel: r.nota <= 3 ? "urgente" : "atencao",
      actionHref: "/portal/crm/satisfacao",
    })
  );
}

/**
 * Aprovações pendentes de gestor — três fontes reais do schema (nenhuma é
 * `ChecklistOccurrence`, que não tem esse conceito): Tarefa aguardando
 * validação (`Task.status = AGUARDANDO_VALIDACAO`), resgate de prêmio da
 * Loja Nord aguardando aprovação (`LojaNordRedemption.status =
 * AGUARDANDO_APROVACAO`) e contagem de estoque concluída aguardando
 * aprovação do fechamento (`StockCount.status = CONCLUIDA`, que só vira
 * `APROVADA` por ação de um gestor — ver src/app/api/estoque/contagens/[id]/route.ts).
 */
export async function loadAlertaAprovacaoPendente(
  empresaId: string,
  nomeLoja: string,
  now: Date = new Date()
): Promise<AlertaItem[]> {
  const [tarefas, resgates, contagens] = await Promise.all([
    prisma.task.findMany({ where: { empresaId, status: "AGUARDANDO_VALIDACAO" } }),
    prisma.lojaNordRedemption.findMany({
      where: { empresaId, status: "AGUARDANDO_APROVACAO" },
      include: { reward: { select: { nome: true } }, user: { select: { name: true } } },
    }),
    prisma.stockCount.findMany({ where: { empresaId, status: "CONCLUIDA" } }),
  ]);

  const alertas: AlertaItem[] = [];

  for (const t of tarefas) {
    alertas.push({
      tipo: "aprovacao_pendente",
      titulo: `Tarefa aguardando validação: ${t.title}`,
      loja: nomeLoja,
      setor: t.sectorKey,
      tempoAtrasoOuPrazo: `aguardando aprovação há ${formatDuracao(now.getTime() - t.updatedAt.getTime())}`,
      nivel: diasEntre(t.updatedAt, now) >= DIAS_LIMITE_URGENTE ? "urgente" : "atencao",
      actionHref: "/portal/tarefas",
    });
  }

  for (const r of resgates) {
    alertas.push({
      tipo: "aprovacao_pendente",
      titulo: `Resgate aguardando aprovação: ${r.reward.nome} — ${r.user.name}`,
      loja: nomeLoja,
      setor: null,
      tempoAtrasoOuPrazo: `aguardando aprovação há ${formatDuracao(now.getTime() - r.createdAt.getTime())}`,
      nivel: diasEntre(r.createdAt, now) >= DIAS_LIMITE_URGENTE ? "urgente" : "atencao",
      actionHref: "/portal/loja-nord/gestao",
    });
  }

  for (const c of contagens) {
    alertas.push({
      tipo: "aprovacao_pendente",
      titulo: `Contagem de estoque aguardando aprovação${c.setor ? ` — ${c.setor}` : ""}`,
      loja: nomeLoja,
      setor: c.setor,
      tempoAtrasoOuPrazo: `aguardando aprovação há ${formatDuracao(now.getTime() - c.updatedAt.getTime())}`,
      nivel: diasEntre(c.updatedAt, now) >= DIAS_LIMITE_URGENTE ? "urgente" : "atencao",
      actionHref: c.type === "SEMANAL" ? "/portal/estoque/contagem-semanal" : "/portal/estoque/contagem-mensal",
    });
  }

  return alertas;
}

const ALERTA_NIVEL_ORDER: Record<AlertaNivel, number> = { urgente: 0, atencao: 1, informativo: 2 };

/** Ordena por severidade (urgente primeiro), preservando a ordem relativa dentro de cada nível. */
export function sortAlertas(alertas: AlertaItem[]): AlertaItem[] {
  return alertas
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const diff = ALERTA_NIVEL_ORDER[a.item.nivel] - ALERTA_NIVEL_ORDER[b.item.nivel];
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map(({ item }) => item);
}
