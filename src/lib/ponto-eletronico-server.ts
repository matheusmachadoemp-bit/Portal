import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// RH — AGREGAÇÕES de Ponto Eletrônico (StatCards + gráficos "por mês")
//
// SEMPRE calculadas via agregação no banco (`aggregate`/`count` do Prisma, ou SQL bruto com
// `date_trunc` quando precisa agrupar por mês, que o Prisma não faz nativamente), nunca
// somando/contando uma lista de `TimeEntry` completa já carregada em outro lugar.
//
// Motivo (task #316, mesma classe do achado do Teulis na revisão da task #309 — Financeiro/
// Ocorrências): `ponto-eletronico-client.tsx` buscava a lista de registros de ponto (`entries`,
// vinda de `/api/rh/time-entries` ou da carga inicial SSR) e os StatCards ("Horas trabalhadas",
// "Atrasos", "Faltas", "Banco de horas") somavam/contavam essa MESMA lista no cliente. Essa lista
// tem `take:2000` desde a task #282/#373 (teto de segurança contra histórico sem fim) — assim que o
// total real de registros de uma loja/colaborador passa de 2000, os 2000 mais recentes ficam, os
// mais antigos somem da lista, e os StatCards passam a refletir só esse recorte, sem nenhum aviso
// visual. O gráfico "Horas trabalhadas por mês"/"Atrasos e faltas por mês"/"Banco de horas
// acumulado" tinha o mesmo problema: também somava a mesma lista com `take`, então o começo da
// série (meses mais antigos) sumia silenciosamente assim que o histórico passava do teto — o ponto
// mais recente do "banco de horas acumulado" ficava sistematicamente errado (a soma acumulada não
// incluía os meses cortados), inconsistente com o valor do StatCard depois de corrigido só ele.
//
// A correção é DESACOPLAR completamente as duas coisas: a lista com `take` continua existindo só
// pra alimentar a TABELA (isso nunca foi o problema, e não muda aqui); os números dos StatCards e
// dos gráficos "por mês" vêm de consultas de agregação separadas, sem `take`, que o Postgres
// resolve direto no banco (a resposta tem no máximo poucas linhas — os totais do período
// selecionado, ou 1 linha por mês com pelo menos 1 registro — nunca 1 linha por registro de ponto),
// então continuam corretos não importa o tamanho do histórico real.
//
// Arquivo próprio (em vez de acrescentar a `src/lib/rh-server.ts`, que já tem funções equivalentes
// pra Financeiro/Ocorrências da task #309): no momento em que esta task começou, a correção da #309
// ainda estava sem commit, ativa num worktree/branch paralelo (`claude/rh-paginas-standalone-take`)
// mexendo no mesmo `rh-server.ts` — decisão do líder pra zerar o risco de conflito de merge textual
// entre as duas tarefas paralelas (nenhum risco de dado: modelos completamente diferentes,
// `TimeEntry` aqui vs. `EmployeeFinanceEntry`/`Occurrence` lá). Se um dia fizer sentido consolidar
// os dois arquivos num só, isso é decisão de refactor pra outro momento.
// ---------------------------------------------------------------------------

/** Minutos de jornada diária esperada — mesma constante (duplicada de propósito, ver rh-helpers.ts) usada em `pontoAlerts` pro cálculo de banco de horas. */
const JORNADA_DIARIA_MINUTOS = 8 * 60;

export type TimeEntryTotals = {
  horas: number;
  atrasos: number;
  faltas: number;
  bancoMinutos: number;
};

/**
 * Totais de Ponto Eletrônico (RH) para os StatCards — via `aggregate`/`count`, ver racional no
 * bloco acima. `where` já deve incluir o filtro de período (`date: { gte, lte }`) quando o usuário
 * tiver um período selecionado na tela — os StatCards respeitam o período (igual ao comportamento
 * anterior, que filtrava a lista já carregada por período antes de somar); os gráficos "por mês"
 * (`computeTimeEntryMonthlyChart`) não, de propósito (ver lá).
 */
export async function computeTimeEntryTotals(where: Prisma.TimeEntryWhereInput): Promise<TimeEntryTotals> {
  const [agg, atrasos, faltas] = await Promise.all([
    prisma.timeEntry.aggregate({ where, _sum: { horasTrabalhadas: true }, _count: { _all: true } }),
    prisma.timeEntry.count({ where: { ...where, atrasoMinutos: { gt: 0 } } }),
    prisma.timeEntry.count({ where: { ...where, falta: true } }),
  ]);
  const horas = agg._sum.horasTrabalhadas ?? 0;
  // Mesma fórmula de `pontoAlerts` (rh-helpers.ts): cada registro do período (trabalhado ou falta)
  // soma/desconta `horasTrabalhadas - 8h` do banco — soma sobre TODOS os registros do `where`, não
  // só os com falta=false, igual o cálculo client-side original fazia.
  const bancoMinutos = horas * 60 - JORNADA_DIARIA_MINUTOS * agg._count._all;
  return { horas, atrasos, faltas, bancoMinutos };
}

export type TimeEntryMonthlyPoint = { mes: string; horas: number; atrasos: number; faltas: number; banco: number };

/**
 * Série mensal de Ponto Eletrônico (gráficos "Horas trabalhadas por mês", "Atrasos e faltas por
 * mês" e "Banco de horas acumulado"), via SQL bruto com `date_trunc('month', ...)` — o Prisma não
 * tem como truncar data dentro de `aggregate`/`groupBy`. Mesmo racional de `computeTimeEntryTotals`:
 * nunca sofre corte de `take`, resultado tem no máximo 1 linha por mês com pelo menos 1 registro.
 * De propósito NÃO recebe filtro de período (mesmo comportamento anterior: o filtro de período da
 * tela escopa a tabela e os StatCards, não esse gráfico — ele é uma tendência de vários meses por
 * natureza, igual à mini-série de 7 dias do painel de Início). `empresaIds`/`employeeId` sempre vão
 * parametrizados (nunca interpolados como string concatenada), mesmo padrão de SQL bruto já usado
 * em outras libs `*-server.ts` do projeto (ex. `src/lib/cmv.ts`).
 *
 * "Banco de horas acumulado" é uma soma corrida (running total) começando do primeiro mês do
 * histórico real (não do primeiro mês que sobrou depois de um corte de `take`) — é exatamente essa
 * soma corrida que ficava errada antes desta correção assim que o histórico passava do teto.
 */
export async function computeTimeEntryMonthlyChart(
  empresaIds: string[],
  employeeId?: string | null
): Promise<TimeEntryMonthlyPoint[]> {
  if (empresaIds.length === 0) return [];
  const employeeFilter = employeeId ? Prisma.sql`AND "employeeId" = ${employeeId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ mes: string; horas: number; atrasos: number; faltas: number; total: number }[]>(Prisma.sql`
    SELECT to_char(date_trunc('month', "date"), 'MM/YYYY') AS mes,
           COALESCE(SUM("horasTrabalhadas"), 0)::float AS horas,
           COUNT(*) FILTER (WHERE "atrasoMinutos" > 0)::int AS atrasos,
           COUNT(*) FILTER (WHERE "falta" = true)::int AS faltas,
           COUNT(*)::int AS total
    FROM "TimeEntry"
    WHERE "empresaId" = ANY(${empresaIds}::text[])
      ${employeeFilter}
    GROUP BY date_trunc('month', "date")
    ORDER BY date_trunc('month', "date") ASC
  `);
  let cumulativeBancoMinutos = 0;
  return rows.map((r) => {
    const horas = Number(r.horas);
    const total = Number(r.total);
    cumulativeBancoMinutos += horas * 60 - JORNADA_DIARIA_MINUTOS * total;
    return {
      mes: r.mes,
      horas: Math.round(horas * 10) / 10,
      atrasos: Number(r.atrasos),
      faltas: Number(r.faltas),
      banco: Math.round(cumulativeBancoMinutos / 60),
    };
  });
}
