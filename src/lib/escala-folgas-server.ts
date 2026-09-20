import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { spStartOfDay, spWeekday } from "@/lib/checklist";
import {
  computeCoverage,
  coversDateKey,
  enumerateDateKeys,
  monthReferenceKey,
  utcDayBounds,
  type CoverageResult,
} from "@/lib/escala-folgas";

/**
 * Escala de Folgas (RH) — helpers server-side (Prisma). Ver `@/lib/escala-folgas` para os
 * cálculos puros e o comentário no bloco "RH — ESCALA DE FOLGAS" em `prisma/schema.prisma` para o
 * desenho geral do módulo.
 */

/**
 * Garante (upsert) o `SchedulePeriod` do mês de `dateKey` para `empresaId` — nasce sozinho na
 * primeira folga cadastrada pra aquele mês/loja, nunca precisa ser criado à mão antes.
 */
export async function resolveSchedulePeriod(empresaId: string, dateKey: string) {
  const mesReferencia = spStartOfDay(monthReferenceKey(dateKey));
  return prisma.schedulePeriod.upsert({
    where: { empresaId_mesReferencia: { empresaId, mesReferencia } },
    update: {},
    create: { empresaId, mesReferencia },
  });
}

/** true quando `weekday` (0=domingo..6=sábado) é um dia fixo de loja fechada ativo para `empresaId`. */
export async function isStoreClosedWeekday(empresaId: string, weekday: number): Promise<boolean> {
  const row = await prisma.storeClosedWeekday.findUnique({
    where: { empresaId_weekday: { empresaId, weekday } },
  });
  return !!row?.ativo;
}

/**
 * `where` Prisma pra `Vacation` cobrindo QUALQUER dia entre `fromKey` e `toKey` (inclusive) —
 * robusto a qualquer convenção de meia-noite usada pra gravar `dataInicio`/`dataFim` (ver
 * `utcDayBounds`, 3º bug de fuso achado pela revisão do Teulis: comparar contra um instante único
 * sub-contava o último dia de toda férias). Chame com `fromKey === toKey` pra checar um único dia
 * (é o que `listIndisponiveisNoSetor` faz) — compartilhado com `getCalendarioDias` (agregador de
 * calendário da Fase 2), que passa um intervalo de verdade, pra não duplicar esta lógica em 2
 * lugares.
 */
function vacationOverlapsRangeWhere(fromKey: string, toKey: string): Prisma.VacationWhereInput {
  const { start: rangeStart } = utcDayBounds(fromKey);
  const { end: rangeEnd } = utcDayBounds(toKey);
  return {
    status: { in: ["APROVADA", "EM_ANDAMENTO"] },
    dataInicio: { lte: rangeEnd },
    dataFim: { gte: rangeStart },
  };
}

/** Mesma ideia de `vacationOverlapsRangeWhere`, pra `Absence` (`dataFim` nulo = em aberto). */
function absenceOverlapsRangeWhere(fromKey: string, toKey: string): Prisma.AbsenceWhereInput {
  const { start: rangeStart } = utcDayBounds(fromKey);
  const { end: rangeEnd } = utcDayBounds(toKey);
  return {
    status: { in: ["PLANEJADO", "EM_ANDAMENTO"] },
    dataInicio: { lte: rangeEnd },
    OR: [{ dataFim: null }, { dataFim: { gte: rangeStart } }],
  };
}

/**
 * Ids de colaboradores ATIVOS de `setor`+`empresaId` já indisponíveis em `dateKey` — soma
 * `DayOffEntry` (folga já cadastrada), `Vacation` (férias aprovadas/em andamento cobrindo a data)
 * e `Absence` (afastamento planejado/em andamento cobrindo a data), sem duplicar dado entre elas.
 * `excludeEmployeeId` ignora a própria `DayOffEntry` de um colaborador específico naquele dia —
 * usado ao reavaliar a cobertura de uma folga já existente (edição), pra não contar a folga antiga
 * dele contra ele mesmo.
 *
 * Só devolve IDs pra CONTAR (cobertura de setor) — pra EXIBIR num calendário (nome, tipo, cor,
 * várias datas de uma vez), ver `getCalendarioDias` logo abaixo (o agregador da Fase 2, que
 * reaproveita `vacationOverlapsRangeWhere`/`absenceOverlapsRangeWhere` em vez de duplicar).
 */
export async function listIndisponiveisNoSetor(
  empresaId: string,
  setor: string,
  dateKey: string,
  opts?: { excludeEmployeeId?: string }
): Promise<Set<string>> {
  const day = spStartOfDay(dateKey);
  const employeeFilter = { setor, status: "ATIVO" as const };

  const [entries, vacations, absences] = await Promise.all([
    prisma.dayOffEntry.findMany({
      where: {
        empresaId,
        date: day,
        employee: employeeFilter,
        ...(opts?.excludeEmployeeId ? { employeeId: { not: opts.excludeEmployeeId } } : {}),
      },
      select: { employeeId: true },
    }),
    prisma.vacation.findMany({
      where: { empresaId, ...vacationOverlapsRangeWhere(dateKey, dateKey), employee: employeeFilter },
      select: { employeeId: true },
    }),
    prisma.absence.findMany({
      where: { empresaId, ...absenceOverlapsRangeWhere(dateKey, dateKey), employee: employeeFilter },
      select: { employeeId: true },
    }),
  ]);

  return new Set([...entries, ...vacations, ...absences].map((row) => row.employeeId));
}

/**
 * Avalia a cobertura do setor de `employeeId` em `dateKey` CONSIDERANDO que ele também ficaria de
 * folga nesse dia — usada antes de criar/editar uma `DayOffEntry` (item 5 do pedido original:
 * mostra aviso com números, nunca bloqueia). Devolve `null` quando não há o que validar: dia de
 * loja fechada (não faz sentido cobrar cobertura de um dia que a loja nem abre) ou setor sem
 * `SectorCoverageConfig` ativa cadastrada (ninguém configurou um mínimo pra esse setor ainda).
 */
export async function evaluateSectorCoverage(params: {
  empresaId: string;
  setor: string;
  employeeId: string;
  dateKey: string;
}): Promise<CoverageResult | null> {
  const weekday = spWeekday(params.dateKey);
  if (await isStoreClosedWeekday(params.empresaId, weekday)) return null;

  const config = await prisma.sectorCoverageConfig.findUnique({
    where: { empresaId_setor: { empresaId: params.empresaId, setor: params.setor } },
  });
  if (!config || !config.ativo) return null;

  const [totalAtivos, indisponiveis] = await Promise.all([
    prisma.employee.count({ where: { empresaId: params.empresaId, setor: params.setor, status: "ATIVO" } }),
    listIndisponiveisNoSetor(params.empresaId, params.setor, params.dateKey, { excludeEmployeeId: params.employeeId }),
  ]);
  indisponiveis.add(params.employeeId);

  return computeCoverage(totalAtivos, indisponiveis.size, config.quantidadeMinima);
}

/**
 * Setor do `Employee` vinculado ao usuário logado — usado pra restringir o Líder (Role
 * SUPERVISOR) à visão/ação do próprio setor na Escala de Folgas (item 16 do pedido original:
 * "Líder vê... do próprio setor", diferente de Gerente/Administrador, que veem a loja inteira).
 * Mesmo padrão de vínculo User -> Employee já usado por `podeExecutarFechamentoCargo`
 * (@/lib/fechamento-server). `null` quando o usuário não tem ficha de RH vinculada — nesse caso a
 * rota que chamar isso deve tratar como "sem setor nenhum visível" (nunca vazar tudo por omissão).
 */
export async function resolveOwnSetor(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employee: { select: { setor: true } } },
  });
  return user?.employee?.setor ?? null;
}

// ---------------------------------------------------------------------------
// Agregador de calendário (Fase 2) — junta as 4 fontes de indisponibilidade (DayOffEntry,
// Vacation, Absence, StoreClosedWeekday) num resultado único por dia, pronto pra uma tela de
// calendário/visão semanal/visão por colaborador consumir sem N+1 de requisições. Usado por
// `GET /api/rh/escala-folgas/calendario`.
// ---------------------------------------------------------------------------

export type CalendarioFonte = "DAY_OFF" | "VACATION" | "ABSENCE";

/** Cor/nome/ícone já resolvidos — igual pros 3 tipos de indisponibilidade "de pessoa" (não pra
 *  loja fechada, que não é uma pessoa). Férias/Afastamento usam as 2 linhas RESERVADAS do
 *  catálogo `DayOffType` (`kind` FERIAS/AFASTAMENTO, ver seed) — mesma cor/nome que o resto do
 *  Portal já usa pra identificar cada tipo, sem inventar uma paleta paralela só pro calendário. */
export type CalendarioDayOffType = { id: string; key: string; nome: string; cor: string; kind: string };

export type CalendarioIndisponivel = {
  employeeId: string;
  employeeName: string;
  setor: string;
  cargo: string;
  photoUrl: string | null;
  empresaId: string;
  fonte: CalendarioFonte;
  /** Id do `DayOffEntry`/`Vacation`/`Absence` de origem — pra tela linkar/abrir o registro. */
  sourceId: string;
  dayOffType: CalendarioDayOffType;
  observacao: string | null;
};

export type CalendarioDia = {
  date: string;
  weekday: number;
  /** Lojas fechadas nesse dia (dia fixo da semana, `StoreClosedWeekday`) — SEMPRE a loja inteira,
   *  nunca filtrado por setor (loja fechada não é um conceito de setor). Vazio na maioria dos dias. */
  lojasFechadas: { empresaId: string; empresaName: string }[];
  indisponiveis: CalendarioIndisponivel[];
};

const RESERVED_TYPE_FALLBACK: Record<"FERIAS" | "AFASTAMENTO", CalendarioDayOffType> = {
  FERIAS: { id: "", key: "ferias", nome: "Férias", cor: "#f59e0b", kind: "FERIAS" },
  AFASTAMENTO: { id: "", key: "afastamento", nome: "Afastamento", cor: "#ef4444", kind: "AFASTAMENTO" },
};

/**
 * Monta o calendário agregado de `fromKey` a `toKey` (inclusive) pras lojas de `empresaIds`,
 * opcionalmente restrito a um `setor`. Só 6 queries no total (nenhuma por dia/por colaborador —
 * a montagem dia a dia acontece em memória, sobre os resultados já carregados), então o custo não
 * cresce com o tamanho do período pedido além do volume de dado real.
 *
 * Diferente de `listIndisponiveisNoSetor` (usada pra cobertura), aqui NÃO filtra colaborador por
 * `status: "ATIVO"` de propósito: o calendário também serve pra olhar um período passado (quem
 * estava de folga mês passado), e um colaborador desligado depois não deve sumir do histórico —
 * mesmo comportamento que `GET /api/rh/escala-folgas/entries` já tinha antes desta fase.
 */
export async function getCalendarioDias(params: {
  empresaIds: string[];
  fromKey: string;
  toKey: string;
  setor?: string | null;
}): Promise<CalendarioDia[] | null> {
  const { empresaIds, fromKey, toKey, setor } = params;
  const dateKeys = enumerateDateKeys(fromKey, toKey);
  if (!dateKeys || empresaIds.length === 0) return null;

  const employeeFilter: Prisma.EmployeeWhereInput = setor ? { setor } : {};

  const [entries, vacations, absences, closedWeekdays, reservedTypes, empresas] = await Promise.all([
    prisma.dayOffEntry.findMany({
      where: {
        empresaId: { in: empresaIds },
        date: { gte: spStartOfDay(fromKey), lte: spStartOfDay(toKey) },
        employee: employeeFilter,
      },
      include: {
        employee: { select: { id: true, name: true, setor: true, cargo: true, photoUrl: true } },
        dayOffType: { select: { id: true, key: true, nome: true, cor: true, kind: true } },
      },
    }),
    prisma.vacation.findMany({
      where: { empresaId: { in: empresaIds }, ...vacationOverlapsRangeWhere(fromKey, toKey), employee: employeeFilter },
      include: { employee: { select: { id: true, name: true, setor: true, cargo: true, photoUrl: true } } },
    }),
    prisma.absence.findMany({
      where: { empresaId: { in: empresaIds }, ...absenceOverlapsRangeWhere(fromKey, toKey), employee: employeeFilter },
      include: { employee: { select: { id: true, name: true, setor: true, cargo: true, photoUrl: true } } },
    }),
    prisma.storeClosedWeekday.findMany({ where: { empresaId: { in: empresaIds }, ativo: true } }),
    // Sem filtro de `ativo`: mesmo que o admin desative "Férias"/"Afastamento" pro cadastro de
    // folga nova (item que fica só disponível via /api/rh/vacations e /api/rh/absences mesmo
    // assim, ver POST /api/rh/escala-folgas/entries), o rótulo/cor continua valendo pra registros
    // já existentes — desativar não é a mesma coisa que apagar.
    prisma.dayOffType.findMany({ where: { kind: { in: ["FERIAS", "AFASTAMENTO"] } } }),
    prisma.empresa.findMany({ where: { id: { in: empresaIds } }, select: { id: true, name: true } }),
  ]);

  const feriasType = reservedTypes.find((t) => t.kind === "FERIAS") ?? RESERVED_TYPE_FALLBACK.FERIAS;
  const afastamentoType = reservedTypes.find((t) => t.kind === "AFASTAMENTO") ?? RESERVED_TYPE_FALLBACK.AFASTAMENTO;
  const empresaNameById = new Map(empresas.map((e) => [e.id, e.name]));
  const closedWeekdaySet = new Set(closedWeekdays.map((c) => `${c.empresaId}:${c.weekday}`));

  return dateKeys.map((date) => {
    const weekday = spWeekday(date);
    const dayInstant = spStartOfDay(date).getTime();

    const lojasFechadas = empresaIds
      .filter((id) => closedWeekdaySet.has(`${id}:${weekday}`))
      .map((id) => ({ empresaId: id, empresaName: empresaNameById.get(id) ?? "" }));

    const indisponiveis: CalendarioIndisponivel[] = [];

    for (const e of entries) {
      if (e.date.getTime() !== dayInstant) continue;
      indisponiveis.push({
        employeeId: e.employeeId,
        employeeName: e.employee.name,
        setor: e.employee.setor,
        cargo: e.employee.cargo,
        photoUrl: e.employee.photoUrl,
        empresaId: e.empresaId,
        fonte: "DAY_OFF",
        sourceId: e.id,
        dayOffType: e.dayOffType,
        observacao: e.observacao,
      });
    }
    for (const v of vacations) {
      if (!coversDateKey(v.dataInicio, v.dataFim, date)) continue;
      indisponiveis.push({
        employeeId: v.employeeId,
        employeeName: v.employee.name,
        setor: v.employee.setor,
        cargo: v.employee.cargo,
        photoUrl: v.employee.photoUrl,
        empresaId: v.empresaId,
        fonte: "VACATION",
        sourceId: v.id,
        dayOffType: feriasType,
        observacao: v.observacao,
      });
    }
    for (const a of absences) {
      if (!coversDateKey(a.dataInicio, a.dataFim, date)) continue;
      indisponiveis.push({
        employeeId: a.employeeId,
        employeeName: a.employee.name,
        setor: a.employee.setor,
        cargo: a.employee.cargo,
        photoUrl: a.employee.photoUrl,
        empresaId: a.empresaId,
        fonte: "ABSENCE",
        sourceId: a.id,
        dayOffType: afastamentoType,
        observacao: a.motivo || a.observacao,
      });
    }

    return { date, weekday, lojasFechadas, indisponiveis };
  });
}
