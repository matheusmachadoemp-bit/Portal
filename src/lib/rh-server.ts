import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * RH — catálogo de Cargos e Setores (`EmployeeCargo`/`EmployeeSetor`, ver schema.prisma).
 *
 * Até aqui, `Employee.cargo`/`Employee.setor` eram texto livre digitado em RH > Colaboradores —
 * o que já causou um bug real: um colaborador de "liderança" foi cadastrado com um `cargo` que
 * não batia, nem por acidente, com nenhum dos 3 nomes fixos do catálogo do Fechamento do Dia
 * (`FechamentoCargo.nome`, comparados por igualdade exata em `podeExecutarFechamentoCargo`,
 * @/lib/fechamento-server) — a pessoa não conseguia preencher o formulário, sem nenhum aviso na
 * tela. Corrigido manualmente pelo usuário para este caso pontual, mas pedido explícito depois
 * disso: "Cargo"/"Setor" em RH > Colaboradores viram uma lista de opções já cadastradas (tela em
 * si é fase futura, do Caio), em vez de digitação livre.
 *
 * `resolveEmployeeCargo`/`resolveEmployeeSetor` são o mecanismo por trás dessa lista: toda rota
 * que grava `Employee.cargo`/`.setor` (criar, editar, importar planilha) passa o texto por aqui
 * antes de gravar. Mesmo racional já usado no projeto para "não deixar um valor novo cair
 * silenciosamente em algo genérico" (ver CLAUDE.md — aplicado antes a `PaymentMethod`, um enum
 * fixo do Prisma; aqui o catálogo é uma tabela editável, então o valor não reconhecido é
 * CADASTRADO automaticamente em vez de precisar de uma migration): se o texto (já normalizado por
 * trim) já bate com um item existente do catálogo daquela empresa, reaproveita; se não bate com
 * nenhum, cadastra um item novo na hora. `Employee.cargo`/`.setor` continuam sendo colunas de
 * texto (não uma FK) — ver comentário do bloco "RH — CATÁLOGO DE CARGOS E SETORES" em
 * schema.prisma para o porquê dessa escolha.
 */

export type ResolveCatalogResult = { ok: true; nome: string; criado: boolean } | { ok: false; error: string };

export async function resolveEmployeeCargo(empresaId: string, cargoBruto: unknown): Promise<ResolveCatalogResult> {
  return resolveCatalogValue(prisma.employeeCargo, "cargo", empresaId, cargoBruto);
}

export async function resolveEmployeeSetor(empresaId: string, setorBruto: unknown): Promise<ResolveCatalogResult> {
  return resolveCatalogValue(prisma.employeeSetor, "setor", empresaId, setorBruto);
}

/**
 * Implementação compartilhada por `resolveEmployeeCargo`/`resolveEmployeeSetor` — os dois
 * catálogos (`EmployeeCargo`/`EmployeeSetor`) têm exatamente a mesma forma (`empresaId` + `nome`
 * único por empresa), só a tabela muda. `delegate` aceita qualquer um dos dois Prisma delegates
 * (mesmo formato de `findUnique`/`create` usado por ambos os models gerados).
 */
async function resolveCatalogValue(
  delegate: {
    findUnique: (args: { where: { empresaId_nome: { empresaId: string; nome: string } } }) => Promise<{ nome: string } | null>;
    create: (args: { data: { empresaId: string; nome: string } }) => Promise<{ nome: string }>;
  },
  campo: "cargo" | "setor",
  empresaId: string,
  valorBruto: unknown
): Promise<ResolveCatalogResult> {
  if (typeof valorBruto !== "string" || !valorBruto.trim()) {
    return { ok: false, error: `Informe o ${campo}.` };
  }
  const nome = valorBruto.trim();

  const existente = await delegate.findUnique({ where: { empresaId_nome: { empresaId, nome } } });
  if (existente) return { ok: true, nome: existente.nome, criado: false };

  try {
    const criado = await delegate.create({ data: { empresaId, nome } });
    return { ok: true, nome: criado.nome, criado: true };
  } catch (e) {
    // Corrida (raríssima, mas possível: dois colaboradores salvos com o mesmo cargo/setor novo
    // ao mesmo tempo) — o `findUnique` acima não viu nada, mas outra requisição criou o mesmo
    // `nome` entre esse `findUnique` e este `create`. `@@unique([empresaId, nome])` já garante
    // que nunca existem duas linhas iguais; aqui só tratamos esse caso como sucesso (reaproveita
    // a linha que a outra requisição acabou de criar) em vez de devolver 500 pra quem só estava
    // tentando salvar um colaborador.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const criadoPorOutraRequisicao = await delegate.findUnique({ where: { empresaId_nome: { empresaId, nome } } });
      if (criadoPorOutraRequisicao) return { ok: true, nome: criadoPorOutraRequisicao.nome, criado: false };
    }
    throw e;
  }
}

/** Catálogo de cargos de uma empresa, ativos primeiro — usado pela futura tela de seleção. */
export async function listEmployeeCargos(empresaId: string) {
  return prisma.employeeCargo.findMany({
    where: { empresaId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
}

/** Catálogo de setores de uma empresa, ativos primeiro — usado pela futura tela de seleção. */
export async function listEmployeeSetores(empresaId: string) {
  return prisma.employeeSetor.findMany({
    where: { empresaId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
}

// ---------------------------------------------------------------------------
// RH — AGREGAÇÕES de Financeiro/Ocorrências (StatCards, gráfico, ranking)
//
// SEMPRE calculadas via agregação no banco (`groupBy`/`_sum`/`_count`/SQL bruto com `date_trunc`),
// nunca somando/contando uma lista de linhas completas já carregada em outro lugar.
//
// Motivo (achado do Teulis na revisão da task #309): antes da #309, as páginas de Financeiro e
// Ocorrências (standalone e ficha do colaborador) buscavam a lista COMPLETA de lançamentos/
// ocorrências sem nenhum `take`, e os StatCards/ranking somavam essa lista inteira no cliente — os
// totais sempre batiam com a realidade (o único risco era performance numa loja com muito
// histórico). A #309 adicionou `take` de segurança nessas listas (pra não crescer sem parar), mas
// os StatCards/ranking continuaram somando/contando a MESMA lista agora cortada — então, assim que
// o total real passa do teto, registros antigos somem silenciosamente da conta (reproduzido ao vivo
// pelo Teulis: R$200.000 em lançamentos antigos sumindo do card "Total recebido"; um colaborador
// com 50 faltas reais ficando com o card "Faltas" zerado e sumindo do ranking).
//
// A correção é DESACOPLAR completamente as duas coisas: a lista com `take` continua existindo só
// pra alimentar a tabela de "atividade recente" (isso nunca foi o problema); os números dos
// StatCards/ranking vêm de consultas de agregação separadas, sem `take`, que o Postgres resolve
// direto no banco (a resposta tem no máximo algumas dezenas de linhas — 1 por tipo de lançamento/
// ocorrência, ou 1 por mês com movimento, ou 1 por colaborador no top 5 do ranking — nunca 1 linha
// por lançamento/ocorrência), então continuam corretas não importa o tamanho do histórico real, sem
// reintroduzir o risco de custo/tamanho de resposta que o `take` da #309 existe pra evitar.
// ---------------------------------------------------------------------------

export type FinanceTotals = {
  salario: number;
  comissao: number;
  bonificacao: number;
  desconto: number;
  vt: number;
  va: number;
  outro: number;
  totalRecebido: number;
};

/** Totais de Financeiro (RH) por tipo, via `groupBy`/`_sum` — ver racional no bloco acima. */
export async function computeFinanceTotals(where: Prisma.EmployeeFinanceEntryWhereInput): Promise<FinanceTotals> {
  const groups = await prisma.employeeFinanceEntry.groupBy({ by: ["type"], where, _sum: { value: true } });
  const byType = new Map(groups.map((g) => [g.type as string, g._sum.value ?? 0]));
  const salario = byType.get("SALARIO") ?? 0;
  const comissao = byType.get("COMISSAO") ?? 0;
  const bonificacao = byType.get("BONIFICACAO") ?? 0;
  const desconto = byType.get("DESCONTO") ?? 0;
  const vt = byType.get("VALE_TRANSPORTE") ?? 0;
  const va = byType.get("VALE_ALIMENTACAO") ?? 0;
  const outro = byType.get("OUTRO") ?? 0;
  const totalRecebido = salario + comissao + bonificacao + vt + va + outro - desconto;
  return { salario, comissao, bonificacao, desconto, vt, va, outro, totalRecebido };
}

export type FinanceChartPoint = { mes: string; valor: number };

/**
 * Série mensal de Financeiro (gráfico "Evolução dos recebimentos"), via SQL bruto com
 * `date_trunc('month', ...)` — o Prisma não tem como truncar data dentro de `groupBy`. Mesmo
 * racional de `computeFinanceTotals`: nunca sofre corte de `take`, resultado tem no máximo 1 linha
 * por mês com pelo menos 1 lançamento. `empresaIds`/`employeeId` sempre vão parametrizados (nunca
 * interpolados como string concatenada), mesmo padrão de SQL bruto já usado em `src/lib/crm-data.ts`.
 */
export async function computeFinanceMonthlyChart(
  empresaIds: string[],
  employeeId?: string | null
): Promise<FinanceChartPoint[]> {
  if (empresaIds.length === 0) return [];
  const employeeFilter = employeeId ? Prisma.sql`AND "employeeId" = ${employeeId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ mes: string; valor: number }[]>(Prisma.sql`
    SELECT to_char(date_trunc('month', "date"), 'MM/YYYY') AS mes,
           COALESCE(SUM("value"), 0)::float AS valor
    FROM "EmployeeFinanceEntry"
    WHERE "empresaId" = ANY(${empresaIds}::text[])
      AND "type" != 'DESCONTO'
      ${employeeFilter}
    GROUP BY date_trunc('month', "date")
    ORDER BY date_trunc('month', "date") ASC
  `);
  return rows.map((r) => ({ mes: r.mes, valor: Number(r.valor) }));
}

export type OccurrenceCounts = { faltas: number; atrasos: number; advertencias: number; suspensoes: number };

/** Contagem de Ocorrências (RH) por tipo, via `groupBy`/`_count` — ver racional no bloco acima. */
export async function computeOccurrenceCounts(where: Prisma.OccurrenceWhereInput): Promise<OccurrenceCounts> {
  const groups = await prisma.occurrence.groupBy({ by: ["type"], where, _count: { id: true } });
  const byType = new Map(groups.map((g) => [g.type as string, g._count.id]));
  return {
    faltas: byType.get("FALTA") ?? 0,
    atrasos: byType.get("ATRASO") ?? 0,
    advertencias: byType.get("ADVERTENCIA") ?? 0,
    suspensoes: byType.get("SUSPENSAO") ?? 0,
  };
}

export type OccurrenceRanking = { atrasos: [string, number][]; faltas: [string, number][] };

/**
 * Ranking (top 5) de colaboradores por atraso/falta — só usado na página standalone (a ficha
 * individual esconde essas seções, um colaborador só não faz ranking). Via `groupBy(employeeId)` +
 * `_count`, direto no banco; uma segunda query pequena (no máximo 10 ids) resolve os nomes.
 */
export async function computeOccurrenceRanking(where: Prisma.OccurrenceWhereInput): Promise<OccurrenceRanking> {
  const [atrasoGroups, faltaGroups] = await Promise.all([
    prisma.occurrence.groupBy({
      by: ["employeeId"],
      where: { ...where, type: "ATRASO" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
    prisma.occurrence.groupBy({
      by: ["employeeId"],
      where: { ...where, type: "FALTA" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
  ]);
  const ids = [...new Set([...atrasoGroups, ...faltaGroups].map((g) => g.employeeId))];
  const employees = ids.length
    ? await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(employees.map((e) => [e.id, e.name]));
  const toPairs = (groups: typeof atrasoGroups): [string, number][] =>
    groups.map((g) => [nameById.get(g.employeeId) ?? "—", g._count.id]);
  return { atrasos: toPairs(atrasoGroups), faltas: toPairs(faltaGroups) };
}
