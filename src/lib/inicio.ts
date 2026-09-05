import { prisma } from "@/lib/prisma";
import { pct, safeDiv } from "@/lib/calc";
import { resolveCrmPeriod, type CrmPeriodKey } from "@/lib/crm";
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, format } from "date-fns";

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
