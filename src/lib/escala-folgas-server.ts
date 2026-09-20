import { prisma } from "@/lib/prisma";
import { spStartOfDay, spWeekday } from "@/lib/checklist";
import { computeCoverage, monthReferenceKey, utcDayBounds, type CoverageResult } from "@/lib/escala-folgas";

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
 * Ids de colaboradores ATIVOS de `setor`+`empresaId` já indisponíveis em `dateKey` — soma
 * `DayOffEntry` (folga já cadastrada), `Vacation` (férias aprovadas/em andamento cobrindo a data)
 * e `Absence` (afastamento planejado/em andamento cobrindo a data), sem duplicar dado entre elas.
 * `excludeEmployeeId` ignora a própria `DayOffEntry` de um colaborador específico naquele dia —
 * usado ao reavaliar a cobertura de uma folga já existente (edição), pra não contar a folga antiga
 * dele contra ele mesmo.
 *
 * NOTA (pendência sinalizada na revisão do Teulis, decisão de sequenciamento do líder — não é pra
 * resolver nesta fase): esta função só devolve IDS pra contar (cobertura de setor), não os
 * registros completos pra EXIBIR num calendário. Ainda não existe nenhum endpoint que junte
 * DayOffEntry + Vacation + Absence + StoreClosedWeekday num resultado único pronto pra tela
 * (ex.: "quem está de folga hoje", com nome/tipo/cor por pessoa) — isso é o agregador que a Fase 2
 * (calendário do Caio) vai precisar, e ainda não foi construído. Quando for a hora, o mais
 * provável é um novo endpoint de leitura (`GET /api/rh/escala-folgas/calendario` ou parecido) que
 * chama as 4 fontes pro período pedido e devolve já mesclado — não uma expansão desta função aqui,
 * que existe só pro cálculo de cobertura.
 */
export async function listIndisponiveisNoSetor(
  empresaId: string,
  setor: string,
  dateKey: string,
  opts?: { excludeEmployeeId?: string }
): Promise<Set<string>> {
  const day = spStartOfDay(dateKey);
  const employeeFilter = { setor, status: "ATIVO" as const };

  // `Vacation`/`Absence.dataInicio`/`.dataFim` guardam uma DATA, não um instante — e podem ter
  // sido gravados com convenção de "meia-noite" diferente da usada aqui (ver `utcDayBounds`, 3º
  // bug de fuso achado pela revisão do Teulis: comparar contra `day` — um instante único —
  // sub-contava o último dia de toda férias/afastamento). `dayStart`/`dayEnd` cobrem o dia inteiro
  // em UTC, então funcionam não importa qual convenção o campo usa.
  const { start: dayStart, end: dayEnd } = utcDayBounds(dateKey);

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
      where: {
        empresaId,
        status: { in: ["APROVADA", "EM_ANDAMENTO"] },
        dataInicio: { lte: dayEnd },
        dataFim: { gte: dayStart },
        employee: employeeFilter,
      },
      select: { employeeId: true },
    }),
    prisma.absence.findMany({
      where: {
        empresaId,
        status: { in: ["PLANEJADO", "EM_ANDAMENTO"] },
        dataInicio: { lte: dayEnd },
        OR: [{ dataFim: null }, { dataFim: { gte: dayStart } }],
        employee: employeeFilter,
      },
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
