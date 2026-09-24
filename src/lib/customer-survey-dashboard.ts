import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pct } from "@/lib/calc";

// ---------------------------------------------------------------------------
// Satisfação do Cliente — Fase 4 (Avaliações + Dashboard Visão Geral, seções
// 11-15 do pedido original). Toda agregação aqui é calculada NO BANCO
// (`groupBy`/`$queryRaw`), nunca carregando a lista completa do período pra
// somar/agrupar em JS — mesmo racional já documentado em
// `src/lib/rh-server.ts` (achado do Teulis, task #309: um `findMany` sem
// `take` alimentando tanto a tabela quanto os StatCards fazia os totais
// desandarem silenciosamente assim que o histórico passava de um teto de
// segurança adicionado depois só pra lista).
// ---------------------------------------------------------------------------

export type EmpresaSurveyConfig = { notaPositivaAPartirDe: number; notaCriticaAbaixoDe: number };

// Mesmos defaults do schema (`CustomerSurveyConfig`) — usados só se uma loja não tiver linha de
// config própria (não deveria acontecer, Fase 1 seeda 1 por loja, mas defensivo).
const NOTA_POSITIVA_A_PARTIR_DE_PADRAO = 8;
const NOTA_CRITICA_ABAIXO_DE_PADRAO = 6;

/**
 * `CustomerSurveyConfig` de cada loja em `empresaIds`, com fallback pros defaults acima —
 * reaproveitado pelo filtro topo (Positivas/Neutras) e pelos KPIs/satisfação por área, já que
 * `notaPositivaAPartirDe`/`notaCriticaAbaixoDe` são configuráveis POR LOJA.
 */
export async function resolveEmpresaConfigs(empresaIds: string[]): Promise<Map<string, EmpresaSurveyConfig>> {
  const map = new Map<string, EmpresaSurveyConfig>();
  if (empresaIds.length === 0) return map;
  const configs = await prisma.customerSurveyConfig.findMany({ where: { empresaId: { in: empresaIds } } });
  const byEmpresa = new Map(configs.map((c) => [c.empresaId, c]));
  for (const empresaId of empresaIds) {
    const c = byEmpresa.get(empresaId);
    map.set(empresaId, {
      notaPositivaAPartirDe: c?.notaPositivaAPartirDe ?? NOTA_POSITIVA_A_PARTIR_DE_PADRAO,
      notaCriticaAbaixoDe: c?.notaCriticaAbaixoDe ?? NOTA_CRITICA_ABAIXO_DE_PADRAO,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Filtro topo (seção 11): Todas / Positivas / Neutras / Críticas / Resolvidas / Pendentes.
// ---------------------------------------------------------------------------

export type AvaliacaoFiltroTopo = "todas" | "positivas" | "neutras" | "criticas" | "resolvidas" | "pendentes";

export const AVALIACAO_FILTRO_TOPO_VALUES: AvaliacaoFiltroTopo[] = [
  "todas",
  "positivas",
  "neutras",
  "criticas",
  "resolvidas",
  "pendentes",
];

/**
 * "Críticas" usa o campo `critica` (congelado no submit a partir da config vigente naquele
 * instante — ver comentário no schema) por definição: é o MESMO campo que decide o push
 * automático (Fase 3) e os KPIs de "avaliações críticas" — precisa ser sempre a mesma resposta
 * pra "isso é crítico?" em todo o Portal, nunca recalculado contra a config atual.
 *
 * "Positivas"/"Neutras" não têm um campo congelado equivalente (só foi decidido congelar o de
 * crítica), então são calculadas contra o `notaPositivaAPartirDe` ATUAL de cada loja — mas as
 * duas sempre excluem `critica = true` explicitamente, em vez de derivar o limite inferior de
 * "neutra" a partir de `notaCriticaAbaixoDe` (que é outro campo, também não-congelado): assim
 * "Críticas" nunca se sobrepõe com "Positivas"/"Neutras" na tela, não importa se a config mudou
 * depois do submit de alguma resposta antiga.
 *
 * "Resolvidas"/"Pendentes" usam `status` — Pendente = qualquer coisa que não seja RESOLVIDA
 * (inclui NOVA e EM_ATENDIMENTO, não só "ninguém assumiu ainda").
 */
export function buildFiltroTopoWhere(
  filtro: AvaliacaoFiltroTopo,
  empresaIds: string[],
  configs: Map<string, EmpresaSurveyConfig>
): Prisma.CustomerSurveyResponseWhereInput {
  const positivaThreshold = (empresaId: string) =>
    configs.get(empresaId)?.notaPositivaAPartirDe ?? NOTA_POSITIVA_A_PARTIR_DE_PADRAO;

  switch (filtro) {
    case "criticas":
      return { critica: true };
    case "positivas":
      return {
        critica: false,
        OR: empresaIds.map((id) => ({ empresaId: id, notaGeral: { gte: positivaThreshold(id) } })),
      };
    case "neutras":
      return {
        critica: false,
        OR: empresaIds.map((id) => ({ empresaId: id, notaGeral: { lt: positivaThreshold(id) } })),
      };
    case "resolvidas":
      return { status: "RESOLVIDA" };
    case "pendentes":
      return { status: { not: "RESOLVIDA" } };
    case "todas":
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// KPIs (seção 12)
// ---------------------------------------------------------------------------

export type DashboardKpis = {
  notaMedia: number;
  totalAvaliacoes: number;
  positivasCount: number;
  positivasPercent: number;
  criticasCount: number;
  criticasPercent: number;
  clientesUnicos: number;
  /** Roleta de prêmios (Fase 6) ainda não existe — sempre 0 por enquanto (nunca omitido: o
   *  pedido original, seção 12, já lista "prêmios ganhos" como KPI fixo do dashboard). */
  premiosGanhos: number;
};

type DashboardKpisRow = { total: number; notaMedia: number; positivas: number; criticas: number; clientesUnicos: number };

/**
 * Uma única query de agregação (via `$queryRaw`, com `LEFT JOIN` em `CustomerSurveyConfig` pra
 * comparar cada linha com o limiar "positiva" DA PRÓPRIA loja dela — necessário pro modo Grupo
 * Nord, onde `empresaIds` pode ter mais de uma loja com limiares diferentes) — nunca carrega as
 * respostas do período pra contar em JS.
 */
export async function computeDashboardKpis(empresaIds: string[], from: Date, to: Date): Promise<DashboardKpis> {
  if (empresaIds.length === 0) {
    return {
      notaMedia: 0,
      totalAvaliacoes: 0,
      positivasCount: 0,
      positivasPercent: 0,
      criticasCount: 0,
      criticasPercent: 0,
      clientesUnicos: 0,
      premiosGanhos: 0,
    };
  }

  const rows = await prisma.$queryRaw<DashboardKpisRow[]>(Prisma.sql`
    SELECT
      COUNT(*)::int AS total,
      COALESCE(AVG(r."notaGeral"), 0)::float AS "notaMedia",
      COUNT(*) FILTER (WHERE r."notaGeral" >= COALESCE(cfg."notaPositivaAPartirDe", ${NOTA_POSITIVA_A_PARTIR_DE_PADRAO}))::int AS positivas,
      COUNT(*) FILTER (WHERE r.critica)::int AS criticas,
      COUNT(DISTINCT r."clienteId")::int AS "clientesUnicos"
    FROM "CustomerSurveyResponse" r
    LEFT JOIN "CustomerSurveyConfig" cfg ON cfg."empresaId" = r."empresaId"
    WHERE r."empresaId" = ANY(${empresaIds}::text[])
      AND r."submittedAt" >= ${from} AND r."submittedAt" <= ${to}
  `);

  const row = rows[0] ?? { total: 0, notaMedia: 0, positivas: 0, criticas: 0, clientesUnicos: 0 };
  const total = Number(row.total);
  const positivas = Number(row.positivas);
  const criticas = Number(row.criticas);
  return {
    notaMedia: Number(row.notaMedia),
    totalAvaliacoes: total,
    positivasCount: positivas,
    positivasPercent: pct(positivas, total),
    criticasCount: criticas,
    criticasPercent: pct(criticas, total),
    clientesUnicos: Number(row.clientesUnicos),
    premiosGanhos: 0,
  };
}

// ---------------------------------------------------------------------------
// Evolução da nota geral (seção 13)
// ---------------------------------------------------------------------------

export type EvolucaoGranularidade = "dia" | "semana" | "mes";

export const EVOLUCAO_GRANULARIDADE_VALUES: EvolucaoGranularidade[] = ["dia", "semana", "mes"];

export type EvolucaoPonto = { data: string; notaMedia: number; total: number };

// Mapa fixo, nunca derivado de input do usuário: os 3 valores abaixo são os únicos jeitos deste
// código monta `Prisma.raw(unit)` dentro do SQL (ver função abaixo) — `granularidade` é validado
// contra `EVOLUCAO_GRANULARIDADE_VALUES` (union type do TypeScript) antes de chegar aqui, nunca
// interpolado direto de `searchParams`.
const EVOLUCAO_UNIT_BY_GRANULARIDADE: Record<EvolucaoGranularidade, string> = {
  dia: "day",
  semana: "week",
  mes: "month",
};

/**
 * Série de evolução da nota geral, agregada no banco via `date_trunc` (Prisma não tem como
 * truncar data dentro de `groupBy` — mesmo motivo de `computeFinanceMonthlyChart`,
 * src/lib/rh-server.ts).
 *
 * `"submittedAt" - interval '3 hours'` antes do `date_trunc`: mesmo ajuste de fuso fixo (UTC-3,
 * sem horário de verão desde 2019) já usado por `spDayStart`/`spAddDays` etc.
 * (src/lib/periods.ts) — sem isso, um bucket "diário" cai no dia ERRADO durante boa parte do
 * horário de funcionamento da loja (18h-23h59 em SP já virou o dia seguinte em UTC), o mesmo bug
 * de fuso já documentado e corrigido em outros pontos do app. `date_trunc('week', ...)` do
 * Postgres já começa a semana na segunda-feira (ISO 8601), igual à convenção de
 * `spWeekStart(date, 1)` usada no resto do Portal.
 */
export async function computeEvolucaoNota(
  empresaIds: string[],
  from: Date,
  to: Date,
  granularidade: EvolucaoGranularidade
): Promise<EvolucaoPonto[]> {
  if (empresaIds.length === 0) return [];
  const unit = EVOLUCAO_UNIT_BY_GRANULARIDADE[granularidade];

  const rows = await prisma.$queryRaw<{ bucket: string; notaMedia: number; total: number }[]>(Prisma.sql`
    SELECT to_char(date_trunc('${Prisma.raw(unit)}', "submittedAt" - interval '3 hours'), 'YYYY-MM-DD') AS bucket,
           COALESCE(AVG("notaGeral"), 0)::float AS "notaMedia",
           COUNT(*)::int AS total
    FROM "CustomerSurveyResponse"
    WHERE "empresaId" = ANY(${empresaIds}::text[])
      AND "submittedAt" >= ${from} AND "submittedAt" <= ${to}
    GROUP BY date_trunc('${Prisma.raw(unit)}', "submittedAt" - interval '3 hours')
    ORDER BY date_trunc('${Prisma.raw(unit)}', "submittedAt" - interval '3 hours') ASC
  `);

  return rows.map((r) => ({ data: r.bucket, notaMedia: Number(r.notaMedia), total: Number(r.total) }));
}

// ---------------------------------------------------------------------------
// Satisfação por área (seção 14)
// ---------------------------------------------------------------------------

export type AreaSatisfacao = { tema: string; mediaPercent: number; total: number; abaixoDaMeta: boolean };

/**
 * Satisfação por área — nota normalizada pra uma escala 0-100 comparável entre os 3 tipos de
 * pergunta que hoje coexistem no mesmo `tema` (o catálogo seedado mistura NOTA_0_5,
 * GOSTEI_NAO_GOSTEI etc. — ver prisma/seed.ts): NOTA_0_5 vira `valor*20`, NOTA_0_10 vira
 * `valor*10`, GOSTEI_NAO_GOSTEI vira 100 (👍) ou 0 (👎). TEXTO_LIVRE não entra na média (sem
 * valor numérico) mas ainda conta pro total de respostas de outras perguntas do mesmo tema.
 *
 * **Decisão sobre "meta" (não especificada no pedido original — seção 14 só pede "abaixo da
 * meta" sem definir o número):** reaproveita `notaPositivaAPartirDe` de `CustomerSurveyConfig`
 * em vez de inventar um limiar novo — já existe, já é configurável por loja, e já significa
 * literalmente "a partir de que nota uma avaliação é considerada positiva", então usar o mesmo
 * corte pra "a área está indo bem" é consistente com o resto do dashboard. Normalizado pra a
 * mesma escala 0-100 (`*10`, já que `notaPositivaAPartirDe` é 0-10). Em modo Grupo Nord (mais de
 * uma loja em `empresaIds`, possivelmente com metas configuradas diferente), usa a MÉDIA das
 * metas das lojas em escopo como referência da visão consolidada — fatiar "abaixo da meta" por
 * loja dentro da mesma área fica pra quando a tela (Caio) precisar disso de verdade, não é óbvio
 * que vale a complexidade agora sem ver a UI.
 */
export async function computeSatisfacaoPorArea(
  empresaIds: string[],
  from: Date,
  to: Date,
  configs: Map<string, EmpresaSurveyConfig>
): Promise<AreaSatisfacao[]> {
  if (empresaIds.length === 0) return [];

  const rows = await prisma.$queryRaw<{ tema: string; mediaPercent: number; total: number }[]>(Prisma.sql`
    WITH normalizado AS (
      SELECT q.tema AS tema,
        CASE
          WHEN q.tipo = 'NOTA_0_5' AND a."valorNota" IS NOT NULL THEN a."valorNota" * 20.0
          WHEN q.tipo = 'NOTA_0_10' AND a."valorNota" IS NOT NULL THEN a."valorNota" * 10.0
          WHEN q.tipo = 'GOSTEI_NAO_GOSTEI' AND a."valorGostei" IS NOT NULL THEN (CASE WHEN a."valorGostei" THEN 100.0 ELSE 0.0 END)
          ELSE NULL
        END AS score
      FROM "CustomerSurveyAnswer" a
      JOIN "CustomerSurveyQuestion" q ON q.id = a."questionId"
      JOIN "CustomerSurveyResponse" r ON r.id = a."responseId"
      WHERE r."empresaId" = ANY(${empresaIds}::text[])
        AND r."submittedAt" >= ${from} AND r."submittedAt" <= ${to}
        AND q.tema IS NOT NULL
    )
    SELECT tema, COALESCE(AVG(score), 0)::float AS "mediaPercent", COUNT(score)::int AS total
    FROM normalizado
    GROUP BY tema
    ORDER BY tema ASC
  `);

  const metas = empresaIds.map((id) => configs.get(id)?.notaPositivaAPartirDe ?? NOTA_POSITIVA_A_PARTIR_DE_PADRAO);
  const metaPercent = (metas.reduce((sum, v) => sum + v, 0) / metas.length) * 10;

  return rows.map((r) => ({
    tema: r.tema,
    mediaPercent: Number(r.mediaPercent),
    total: Number(r.total),
    abaixoDaMeta: Number(r.mediaPercent) < metaPercent,
  }));
}

// ---------------------------------------------------------------------------
// Motivos de avaliações negativas (seção 15)
// ---------------------------------------------------------------------------

export type MotivoNegativo = { motivoTagId: string; nome: string; total: number };

/**
 * Motivos de avaliações NEGATIVAS (seção 15 — por isso `critica: true` no filtro abaixo, não
 * qualquer avaliação com `motivoTagId` preenchido): o campo é opcional em
 * `POST .../resolver` (Fase 3) pra qualquer avaliação assumida, não só as críticas — um
 * responsável poderia, em tese, categorizar o motivo de uma avaliação positiva/neutra por algum
 * outro critério interno, e isso não deveria poluir um gráfico que é especificamente sobre "por
 * que as avaliações negativas foram negativas".
 *
 * `motivoTagId` só é preenchido quando alguém RESOLVE uma avaliação (Fase 3,
 * `POST .../resolver`): é o responsável quem escolhe o motivo ao tratar a ocorrência, nunca o
 * cliente no formulário público (decisão do Matheus já registrada na Fase 1). Enquanto não
 * houver nenhuma avaliação crítica resolvida com motivo preenchido, este array vem vazio —
 * esperado, não é bug.
 */
export async function computeMotivosNegativos(empresaIds: string[], from: Date, to: Date): Promise<MotivoNegativo[]> {
  if (empresaIds.length === 0) return [];

  const groups = await prisma.customerSurveyResponse.groupBy({
    by: ["motivoTagId"],
    where: { empresaId: { in: empresaIds }, submittedAt: { gte: from, lte: to }, critica: true, motivoTagId: { not: null } },
    _count: { _all: true },
  });
  if (groups.length === 0) return [];

  const tagIds = groups.map((g) => g.motivoTagId as string);
  const tags = await prisma.customerSurveyReasonTag.findMany({ where: { id: { in: tagIds } }, select: { id: true, nome: true } });
  const nomeById = new Map(tags.map((t) => [t.id, t.nome]));

  return groups
    .map((g) => ({
      motivoTagId: g.motivoTagId as string,
      nome: nomeById.get(g.motivoTagId as string) ?? "Motivo removido",
      total: g._count._all,
    }))
    .sort((a, b) => b.total - a.total);
}
