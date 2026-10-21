import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { buildFeedbackWhere, FEEDBACK_STATUS_TERMINAL } from "@/lib/feedback-server";
import type { Prisma } from "@prisma/client";

const BUG_STATUS_ABERTO: Prisma.FeedbackReportWhereInput = {
  tipo: "BUG",
  status: { notIn: ["CORRIGIDO", "NAO_REPRODUZIDO"] },
};

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function resolveModuloLabel(r: {
  categoria: { name: string } | null;
  subcategoria: { name: string; category: { name: string } } | null;
  moduloAfetadoTexto: string | null;
}): string {
  if (r.subcategoria) return `${r.subcategoria.category.name} > ${r.subcategoria.name}`;
  if (r.categoria) return r.categoria.name;
  return r.moduloAfetadoTexto?.trim() || "Não informado";
}

/**
 * GET — indicadores agregados (admin only) pro dashboard visual da Fase 3 (Caio): totais por
 * status/tipo, tempo médio de primeira resposta e de resolução, bugs por módulo/prioridade,
 * evolução mensal. Formato pensado pra consumo direto em gráfico (séries/agrupamentos já
 * prontos, sem o front precisar reprocessar).
 *
 * Filtros opcionais (querystring): `empresaId`, `from`, `to` — aplicados a TODOS os indicadores
 * (inclusive "evolução mensal", que por padrão olha os últimos 12 meses a partir de hoje se
 * nenhum período for informado).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" || !(await hasModulePermission(session.user.id, "bugs-melhorias", "canView"))) {
    return NextResponse.json({ error: "Sem permissão para acessar a Central de Bugs e Melhorias." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get("empresaId");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : null;
  const to = toParam ? new Date(toParam) : null;
  const evolucaoDesde = from ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const baseWhere = buildFeedbackWhere({ empresaId, from, to });
  const bugWhere: Prisma.FeedbackReportWhereInput = { AND: [baseWhere, { tipo: "BUG" }] };
  const sugestaoWhere: Prisma.FeedbackReportWhereInput = { AND: [baseWhere, { tipo: "SUGESTAO" }] };

  const [
    totalBugs,
    totalSugestoes,
    bugsAbertos,
    bugsCriticosAbertos,
    sugestoesEmAvaliacao,
    porStatusRaw,
    porPrioridadeRaw,
    concluidos,
    primeirasRespostas,
    bugsParaRanking,
    evolucaoRaw,
  ] = await Promise.all([
    prisma.feedbackReport.count({ where: bugWhere }),
    prisma.feedbackReport.count({ where: sugestaoWhere }),
    prisma.feedbackReport.count({ where: { AND: [baseWhere, BUG_STATUS_ABERTO] } }),
    prisma.feedbackReport.count({ where: { AND: [baseWhere, BUG_STATUS_ABERTO, { impacto: "CRITICO" }] } }),
    prisma.feedbackReport.count({ where: { AND: [sugestaoWhere, { status: { in: ["RECEBIDA", "EM_AVALIACAO"] } }] } }),
    prisma.feedbackReport.groupBy({ by: ["tipo", "status"], where: baseWhere, _count: { _all: true } }),
    prisma.feedbackReport.groupBy({ by: ["prioridade"], where: bugWhere, _count: { _all: true } }),
    prisma.feedbackReport.findMany({
      where: { AND: [baseWhere, { dataConclusao: { not: null } }] },
      select: { createdAt: true, dataConclusao: true },
      take: 500,
      orderBy: { dataConclusao: "desc" },
    }),
    prisma.feedbackHistory.findMany({
      where: { feedbackReport: baseWhere },
      orderBy: [{ feedbackReportId: "asc" }, { createdAt: "asc" }],
      distinct: ["feedbackReportId"],
      select: { createdAt: true, feedbackReport: { select: { createdAt: true } } },
      take: 1000,
    }),
    prisma.feedbackReport.findMany({
      where: bugWhere,
      select: {
        moduloAfetadoTexto: true,
        categoria: { select: { name: true } },
        subcategoria: { select: { name: true, category: { select: { name: true } } } },
      },
      take: 2000,
    }),
    prisma.feedbackReport.findMany({
      where: { AND: [baseWhere, { createdAt: { gte: evolucaoDesde } }] },
      select: { createdAt: true, tipo: true },
      take: 5000,
    }),
  ]);

  const tempoMedioResolucaoHoras =
    concluidos.length > 0
      ? concluidos.reduce((sum, r) => sum + ((r.dataConclusao as Date).getTime() - r.createdAt.getTime()), 0) /
        concluidos.length /
        (1000 * 60 * 60)
      : null;

  const temposPrimeiraResposta = primeirasRespostas.map(
    (h) => h.createdAt.getTime() - h.feedbackReport.createdAt.getTime()
  );
  const tempoMedioPrimeiraRespostaHoras =
    temposPrimeiraResposta.length > 0
      ? temposPrimeiraResposta.reduce((sum, ms) => sum + ms, 0) / temposPrimeiraResposta.length / (1000 * 60 * 60)
      : null;

  const porModuloMap = new Map<string, number>();
  for (const r of bugsParaRanking) {
    const label = resolveModuloLabel(r);
    porModuloMap.set(label, (porModuloMap.get(label) ?? 0) + 1);
  }
  const porModulo = [...porModuloMap.entries()]
    .map(([modulo, count]) => ({ modulo, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const evolucaoMap = new Map<string, { bugs: number; sugestoes: number }>();
  for (const r of evolucaoRaw) {
    const key = monthKey(r.createdAt);
    const entry = evolucaoMap.get(key) ?? { bugs: 0, sugestoes: 0 };
    if (r.tipo === "BUG") entry.bugs++;
    else entry.sugestoes++;
    evolucaoMap.set(key, entry);
  }
  const evolucaoMensal = [...evolucaoMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([mes, v]) => ({ mes, ...v }));

  const porStatus = porStatusRaw.map((g) => ({ tipo: g.tipo, status: g.status, count: g._count._all }));
  const porPrioridade = porPrioridadeRaw.map((g) => ({ prioridade: g.prioridade, count: g._count._all }));

  return NextResponse.json({
    kpis: {
      totalBugs,
      totalSugestoes,
      bugsAbertos,
      bugsCriticosAbertos,
      sugestoesEmAvaliacao,
      tempoMedioPrimeiraRespostaHoras,
      tempoMedioResolucaoHoras,
    },
    porStatus,
    porPrioridade,
    porModulo,
    evolucaoMensal,
    // Exposto pro front saber quais status contam como "terminal" sem duplicar a lista.
    statusTerminal: [...FEEDBACK_STATUS_TERMINAL],
  });
}
