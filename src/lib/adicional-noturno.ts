import { prisma } from "@/lib/prisma";
import { spStartOfDay } from "@/lib/timezone";
import { computeAdjustedWorkIntervals, MINUTOS_DIA, type TimeEntryTimesLike } from "@/lib/rh-helpers";
import type { NightShiftAllowance } from "@prisma/client";

/**
 * Motor de cálculo do Adicional Noturno (Art. 73 da CLT) — primeiro pedaço do módulo de RH
 * "Salário" (sidebar RH > Financeiro > Salário; tela "Folha Salarial" ainda não existe, nasce
 * numa tarefa própria do Caio depois que isto for publicado). Regras fixas, decididas com o
 * usuário — não configuráveis por loja/colaborador:
 *
 * - Janela noturna: 22h00 às 05h00 (recorrente todo dia, cruzando a meia-noite).
 * - Percentual do adicional: 20% sobre o valor da hora.
 * - Fator de conversão pra "hora reduzida": 60 ÷ 52,5 (≈ 1,142857) — cada hora corrida dentro da
 *   janela noturna conta como essa fração extra de hora pro cálculo do valor.
 *
 * Valor final: `(salarioFixo / divisorContratual) * horasNoturnasConvertidas * 0.20`.
 */

const NIGHT_WINDOW_START_MIN = 22 * 60; // 22:00 = 1320min
const NIGHT_WINDOW_LENGTH_MIN = 7 * 60; // 22:00 -> 05:00 do dia seguinte = 7h = 420min
const ADICIONAL_NOTURNO_PERCENTUAL = 0.2;
export const HORA_REDUZIDA_FATOR = 60 / 52.5;
export const DIVISOR_CONTRATUAL_PADRAO = 220;

/**
 * Minutos de interseção entre um intervalo trabalhado (`[startCont, endCont)`, na mesma linha do
 * tempo CONTÍNUA de `computeAdjustedWorkIntervals` — minutos a partir da meia-noite do dia da
 * entrada, podendo passar de 1440 quando o turno cruza a virada) e a janela noturna 22h–05h, que
 * se repete todo dia (a cada 1440min). Generalizado pra somar a interseção com TODAS as
 * ocorrências da janela que caibam no intervalo (cobre até o caso extremo, teoricamente possível
 * mas nunca esperado na prática, de um intervalo cruzar mais de uma virada de dia).
 */
function nightOverlapMinutes(startCont: number, endCont: number): number {
  if (endCont <= startCont) return 0;
  let total = 0;
  const kMin = Math.floor((startCont - NIGHT_WINDOW_START_MIN) / MINUTOS_DIA) - 1;
  const kMax = Math.ceil(endCont / MINUTOS_DIA) + 1;
  for (let k = kMin; k <= kMax; k++) {
    const windowStart = NIGHT_WINDOW_START_MIN + k * MINUTOS_DIA;
    const windowEnd = windowStart + NIGHT_WINDOW_LENGTH_MIN;
    const overlapStart = Math.max(startCont, windowStart);
    const overlapEnd = Math.min(endCont, windowEnd);
    if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
  }
  return total;
}

/**
 * Minutos reais dentro da janela 22h–05h de UMA marcação de ponto (`TimeEntry`) — reaproveita
 * `computeAdjustedWorkIntervals` (`@/lib/rh-helpers`) pra nunca duplicar a lógica de virada de
 * dia que `computeHorasTrabalhadas` já resolve corretamente; só recorta, por cima dos mesmos
 * intervalos já ajustados, a interseção com a janela noturna em vez de só somar a duração total.
 */
function nightMinutesForTimeEntry(entry: TimeEntryTimesLike): number {
  const adjusted = computeAdjustedWorkIntervals(entry);
  if (!adjusted) return 0;
  return adjusted.intervals.reduce((sum, [start, end]) => sum + nightOverlapMinutes(start, end), 0);
}

/**
 * Versão em HORAS (arredondada a 2 casas) de `nightMinutesForTimeEntry` — exportada por ser a
 * parte pura/testável sem banco do motor de cálculo (ver `adicional-noturno.test.ts`); usada
 * internamente por `recalcularAdicionalNoturnoColaborador` pra cada `TimeEntry` da competência.
 */
export function computeHorasNoturnasReaisTimeEntry(entry: TimeEntryTimesLike): number {
  return Math.round((nightMinutesForTimeEntry(entry) / 60) * 100) / 100;
}

/**
 * Intervalo `[from, to)` (UTC, fuso de São Paulo) de uma competência mês/ano — exportado pra ser
 * reaproveitado pela rota da Folha Salarial (`/api/rh/salario/folha`), que precisa do mesmo
 * recorte de datas pra somar `EmployeeFinanceEntry` do tipo DESCONTO da competência.
 */
export function competenciaRange(competenciaMes: number, competenciaAno: number): { from: Date; to: Date } {
  const from = spStartOfDay(`${competenciaAno}-${String(competenciaMes).padStart(2, "0")}-01`);
  const nextMes = competenciaMes === 12 ? 1 : competenciaMes + 1;
  const nextAno = competenciaMes === 12 ? competenciaAno + 1 : competenciaAno;
  const to = spStartOfDay(`${nextAno}-${String(nextMes).padStart(2, "0")}-01`);
  return { from, to };
}

export type RecalcularAdicionalNoturnoStatus = "calculado" | "nao_elegivel" | "travado";

export type RecalcularAdicionalNoturnoResult = {
  status: RecalcularAdicionalNoturnoStatus;
  allowance: NightShiftAllowance | null;
};

/**
 * Recalcula (upsert) o `NightShiftAllowance` de UM colaborador numa competência (mês/ano)
 * específica, a partir das marcações reais de `TimeEntry` daquele mês.
 *
 * Decisões tomadas sem o usuário por ambiguidade do pedido original (documentadas no relatório
 * da tarefa):
 * - Colaborador sem NENHUM minuto dentro da janela noturna no mês inteiro não gera linha (nunca
 *   aparece na Folha Salarial com zero) — se já existia uma linha `PENDENTE` de um cálculo
 *   anterior (ex.: `TimeEntry` editado/excluído depois) e o recálculo zerou, a linha é apagada
 *   (deixou de ser elegível). Uma linha já `APROVADO`/`REPROVADO` NUNCA é apagada por este
 *   motivo — é histórico decidido, só reaberta explicitamente (ver `forcarRecalculoTravado`).
 * - Uma linha já `APROVADO`/`REPROVADO` é travada: recalcular não toca nela (retorna o valor já
 *   salvo, sem sobrescrever) a menos que `forcarRecalculoTravado: true` seja passado — reservado
 *   pra um fluxo de reabertura futuro (fora do escopo desta tarefa; nenhuma rota chama com
 *   `true` hoje). Reabrir sempre devolve a linha pro status `PENDENTE` (nunca herda a aprovação/
 *   reprovação anterior com números novos).
 * - `Employee.salarioFixo`/`divisorContratual` ausentes caem em `0`/`DIVISOR_CONTRATUAL_PADRAO`
 *   (220) — um colaborador sem salário cadastrado gera `valorAdicional = 0` em vez de quebrar o
 *   cálculo da competência inteira.
 */
export async function recalcularAdicionalNoturnoColaborador(
  employeeId: string,
  competenciaMes: number,
  competenciaAno: number,
  options: { forcarRecalculoTravado?: boolean } = {}
): Promise<RecalcularAdicionalNoturnoResult> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, empresaId: true, salarioFixo: true, divisorContratual: true },
  });
  if (!employee) throw new Error("Colaborador não encontrado.");

  const existing = await prisma.nightShiftAllowance.findUnique({
    where: { employeeId_competenciaMes_competenciaAno: { employeeId, competenciaMes, competenciaAno } },
  });
  if (existing && existing.status !== "PENDENTE" && !options.forcarRecalculoTravado) {
    return { status: "travado", allowance: existing };
  }

  const { from, to } = competenciaRange(competenciaMes, competenciaAno);
  const timeEntries = await prisma.timeEntry.findMany({
    where: { employeeId, date: { gte: from, lt: to } },
    select: { entrada: true, saidaAlmoco: true, retornoAlmoco: true, saida: true },
  });

  const totalNightMinutes = timeEntries.reduce((sum, entry) => sum + nightMinutesForTimeEntry(entry), 0);

  if (totalNightMinutes <= 0) {
    if (existing) {
      await prisma.nightShiftAllowance.delete({ where: { id: existing.id } });
    }
    return { status: "nao_elegivel", allowance: null };
  }

  const horasNoturnasReais = Math.round((totalNightMinutes / 60) * 100) / 100;
  const horasNoturnasConvertidas = Math.round(horasNoturnasReais * HORA_REDUZIDA_FATOR * 100) / 100;
  const divisor = employee.divisorContratual ?? DIVISOR_CONTRATUAL_PADRAO;
  const salarioFixo = employee.salarioFixo ?? 0;
  const valorAdicional = Math.round((salarioFixo / divisor) * horasNoturnasConvertidas * ADICIONAL_NOTURNO_PERCENTUAL * 100) / 100;

  const allowance = await prisma.nightShiftAllowance.upsert({
    where: { employeeId_competenciaMes_competenciaAno: { employeeId, competenciaMes, competenciaAno } },
    create: {
      employeeId,
      empresaId: employee.empresaId,
      competenciaMes,
      competenciaAno,
      horasNoturnasReais,
      horasNoturnasConvertidas,
      valorAdicional,
      status: "PENDENTE",
    },
    update: {
      horasNoturnasReais,
      horasNoturnasConvertidas,
      valorAdicional,
      // Recalcular sempre devolve pro status PENDENTE: tanto o caso comum (linha já estava
      // PENDENTE, valor mudou) quanto o caso de reabertura forçada (`forcarRecalculoTravado`) —
      // nenhum dos dois deve herdar uma aprovação/reprovação associada aos números antigos.
      status: "PENDENTE",
      aprovadoPorId: null,
      aprovadoEm: null,
    },
  });

  return { status: "calculado", allowance };
}

export type RecalcularAdicionalNoturnoCompetenciaResult = {
  processados: number;
  calculados: number;
  naoElegiveis: number;
};

/**
 * Roda `recalcularAdicionalNoturnoColaborador` pra todos os colaboradores "elegíveis" de uma
 * competência — usada pelo cron automático do dia 2 (`/api/cron/rh/adicional-noturno`) e
 * reaproveitável por uma rota manual futura.
 *
 * "Elegível" aqui = tem ao menos 1 `TimeEntry` na competência (quem não bateu ponto no mês não
 * tem como ter hora noturna) — não filtra por `Employee.status`: um colaborador desligado NO
 * MEIO do mês ainda pode ter trabalhado horas noturnas antes de saír, e essas horas continuam
 * devidas; `Employee.status` reflete o status ATUAL (no momento em que o cron roda, já pode ser
 * `DESLIGADO`), não o status histórico durante o mês — filtrar por ele excluiria injustamente
 * esse caso.
 */
export async function recalcularAdicionalNoturnoCompetencia(
  competenciaMes: number,
  competenciaAno: number,
  options: { empresaId?: string } = {}
): Promise<RecalcularAdicionalNoturnoCompetenciaResult> {
  const { from, to } = competenciaRange(competenciaMes, competenciaAno);

  const rows = await prisma.timeEntry.findMany({
    where: {
      date: { gte: from, lt: to },
      ...(options.empresaId ? { empresaId: options.empresaId } : {}),
    },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });

  let calculados = 0;
  let naoElegiveis = 0;
  for (const { employeeId } of rows) {
    const result = await recalcularAdicionalNoturnoColaborador(employeeId, competenciaMes, competenciaAno);
    if (result.status === "calculado") calculados++;
    else if (result.status === "nao_elegivel") naoElegiveis++;
    // "travado" não deveria acontecer no fluxo automático (a competência processada pelo cron
    // acabou de fechar, nunca teve tempo de ser aprovada/reprovada) — mas se acontecer (ex.:
    // alguém força o recálculo manual de novo depois de já ter aprovado à mão), só pula sem
    // contar, sem sobrescrever a decisão já tomada.
  }

  return { processados: rows.length, calculados, naoElegiveis };
}
