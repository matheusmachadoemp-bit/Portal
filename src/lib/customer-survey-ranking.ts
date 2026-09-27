import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pct } from "@/lib/calc";

// ---------------------------------------------------------------------------
// Satisfação do Cliente — Fase 5 (Ranking de Garçons, seção 16 do pedido original — só os 2
// rankings confirmados com o Matheus: "qual garçom mais convidou pra pesquisa" e "melhor NPS". A
// métrica de conversão (seção 17, indicações → respondidas) foi descartada nesta fase: confirmado
// com o Matheus que a indicação NASCE junto da avaliação já respondida — não existe hoje (nem foi
// pedido criar) nenhum registro de "cliente convidado" separado de "cliente que respondeu" (ver
// `CustomerSurveyResponse.garcomIndicadoId`, sempre preenchido numa linha que já É uma resposta) —
// então essa conversão sempre daria 100% e não carregaria informação nenhuma.
//
// Os dois rankings vêm da MESMA agregação de base: uma resposta com `garcomIndicadoId`
// preenchido conta, ao mesmo tempo, como "1 indicação" (ranking 1) e como "1 resposta
// considerada" pro NPS daquele garçom (ranking 2) — por isso `fetchGarcomAggregates` roda uma
// ÚNICA query agregada no banco (`$queryRaw`, mesmo racional de "toda agregação é calculada NO
// BANCO, nunca em JS" já documentado em customer-survey-dashboard.ts) e as duas funções públicas
// abaixo só reformatam/reordenam o mesmo resultado.
//
// Só considera garçom ELEGÍVEL (`Employee.atendeSalao = true AND status = "ATIVO"` — mesmo filtro
// de `getSelectableGarcons`/`isValidGarcomIndicado`, customer-survey-server.ts) E com pelo menos 1
// resposta no período (o INNER JOIN abaixo já garante isso): um garçom elegível sem nenhuma
// indicação no período simplesmente não aparece em nenhum dos dois rankings, em vez de aparecer
// com "0 indicações"/"NPS indefinido" — mesmo padrão de `computeMotivosNegativos` (só emergem os
// grupos que realmente têm dado), e evita um NPS "0/0" sendo lido por engano como neutro (0).
// Decisão registrada aqui para o líder confirmar/ajustar se fizer sentido mostrar os "zerados".
// ---------------------------------------------------------------------------

type GarcomAggregateRow = {
  garcomId: string;
  nome: string;
  total: number;
  promotores: number;
  detratores: number;
};

/**
 * Agregação de base: pra cada garçom elegível de `empresaIds` com pelo menos 1 indicação no
 * período `[from, to]`, conta o total de respostas onde ele é o indicado, quantas são
 * "promotoras" (nota 9-10) e quantas são "detratoras" (nota 0-6) — faixas fixas do NPS padrão de
 * mercado (9-10 promotor / 7-8 neutro / 0-6 detrator), DIFERENTES de propósito de
 * `CustomerSurveyConfig.notaPositivaAPartirDe`/`notaCriticaAbaixoDe` (aqueles são limiares
 * operacionais configuráveis POR LOJA, usados pelo dashboard da Fase 4 — outra finalidade; NPS é
 * uma métrica com definição fixa e conhecida, não pode variar por configuração de loja — decisão
 * confirmada com o Matheus antes de implementar esta fase).
 */
async function fetchGarcomAggregates(empresaIds: string[], from: Date, to: Date): Promise<GarcomAggregateRow[]> {
  if (empresaIds.length === 0) return [];

  const rows = await prisma.$queryRaw<GarcomAggregateRow[]>(Prisma.sql`
    SELECT
      e.id AS "garcomId",
      e.name AS "nome",
      COUNT(r.id)::int AS total,
      COUNT(r.id) FILTER (WHERE r."notaGeral" >= 9)::int AS promotores,
      COUNT(r.id) FILTER (WHERE r."notaGeral" <= 6)::int AS detratores
    FROM "Employee" e
    JOIN "CustomerSurveyResponse" r
      ON r."garcomIndicadoId" = e.id
     AND r."empresaId" = e."empresaId"
    WHERE e."empresaId" = ANY(${empresaIds}::text[])
      AND e."atendeSalao" = true
      AND e.status = 'ATIVO'
      AND r."submittedAt" >= ${from} AND r."submittedAt" <= ${to}
    GROUP BY e.id, e.name
  `);

  return rows.map((r) => ({
    garcomId: r.garcomId,
    nome: r.nome,
    total: Number(r.total),
    promotores: Number(r.promotores),
    detratores: Number(r.detratores),
  }));
}

// ---------------------------------------------------------------------------
// Ranking 1 — quantidade de indicações
// ---------------------------------------------------------------------------

export type RankingIndicacoes = { garcomId: string; nome: string; indicacoes: number; totalRespostas: number };

// ---------------------------------------------------------------------------
// Ranking 2 — NPS
// ---------------------------------------------------------------------------

export type RankingNps = { garcomId: string; nome: string; nps: number; totalRespostas: number };

export type RankingGarcons = { porIndicacoes: RankingIndicacoes[]; porNps: RankingNps[] };

/**
 * Os 2 rankings de garçons, a partir da MESMA agregação de base (uma única query — ver
 * `fetchGarcomAggregates` acima —, nunca duas: as duas listas abaixo só reformatam/reordenam o
 * mesmo resultado, não faz sentido pagar o round-trip ao banco duas vezes pro mesmo dado).
 *
 * `porIndicacoes`: quantas vezes cada garçom foi marcado como `garcomIndicadoId` em avaliações
 * respondidas, no período — ordenado do maior pro menor (empate: nome ASC, resultado estável).
 * `totalRespostas` aqui é sempre igual a `indicacoes` (a própria contagem já É a quantidade de
 * respostas consideradas) — campo mantido explícito mesmo redundante nesta ranking só pra bater
 * com o mesmo formato do ranking por NPS, pra quem for montar a tela depois não precisar tratar
 * os dois formatos de objeto de forma diferente (pedido explícito do escopo desta fase).
 *
 * `porNps`: NPS de verdade (fórmula padrão de mercado: `% promotores − % detratores`, entre -100
 * e +100), calculado só entre as respostas onde aquele garçom é o indicado — ordenado do maior
 * pro menor (empate: mais respostas primeiro, depois nome ASC). Não arredonda aqui (mesmo padrão
 * de `pct`/demais KPIs deste módulo: o valor cru sai da lib, formatação de casas decimais é
 * problema da tela, que ainda não existe nesta fase).
 */
export async function computeRankingGarcons(empresaIds: string[], from: Date, to: Date): Promise<RankingGarcons> {
  const aggregates = await fetchGarcomAggregates(empresaIds, from, to);

  const porIndicacoes = aggregates
    .map((a) => ({ garcomId: a.garcomId, nome: a.nome, indicacoes: a.total, totalRespostas: a.total }))
    .sort((x, y) => y.indicacoes - x.indicacoes || x.nome.localeCompare(y.nome));

  const porNps = aggregates
    .map((a) => ({
      garcomId: a.garcomId,
      nome: a.nome,
      nps: pct(a.promotores, a.total) - pct(a.detratores, a.total),
      totalRespostas: a.total,
    }))
    .sort((x, y) => y.nps - x.nps || y.totalRespostas - x.totalRespostas || x.nome.localeCompare(y.nome));

  return { porIndicacoes, porNps };
}
