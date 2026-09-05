import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { endOfWeek, endOfMonth, endOfYear, startOfWeek, startOfMonth, startOfYear, subDays } from "date-fns";

type Periodo = "semana" | "mes" | "ano" | "geral";

function rangeForPeriodo(periodo: Periodo, now: Date): { start: Date; end: Date } | null {
  if (periodo === "semana") return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
  if (periodo === "mes") return { start: startOfMonth(now), end: endOfMonth(now) };
  if (periodo === "ano") return { start: startOfYear(now), end: endOfYear(now) };
  return null;
}

function previousRange(range: { start: Date; end: Date }) {
  const durationMs = range.end.getTime() - range.start.getTime();
  return { start: subDays(range.start, Math.round(durationMs / (24 * 60 * 60 * 1000)) + 1), end: subDays(range.start, 1) };
}

async function rankForRange(where: object) {
  const rows = await prisma.lojaNordPointTransaction.groupBy({
    by: ["userId"],
    where: { ...where, pontos: { gt: 0 } },
    _sum: { pontos: true },
  });
  return rows
    .map((r) => ({ userId: r.userId, pontos: r._sum.pontos ?? 0 }))
    .sort((a, b) => b.pontos - a.pontos)
    .map((r, idx) => ({ ...r, posicao: idx + 1 }));
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const periodo = (searchParams.get("periodo") as Periodo) || "geral";
  const empresaId = searchParams.get("empresaId");
  const setor = searchParams.get("setor");
  const origem = searchParams.get("origem");

  const now = new Date();
  const range = rangeForPeriodo(periodo, now);

  const baseWhere: Record<string, unknown> = {};
  if (range) baseWhere.createdAt = { gte: range.start, lte: range.end };
  if (empresaId) baseWhere.empresaId = empresaId;
  if (setor) baseWhere.setor = setor;
  if (origem) baseWhere.origem = origem;

  const previousWhere: Record<string, unknown> | null = range
    ? { ...baseWhere, createdAt: { gte: previousRange(range).start, lte: previousRange(range).end } }
    : null;

  const [current, previous, users, tarefasCount, checklistsCount, cursosCount] = await Promise.all([
    rankForRange(baseWhere),
    previousWhere ? rankForRange(previousWhere) : Promise.resolve([]),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, avatarUrl: true, role: true } }),
    prisma.lojaNordPointTransaction.groupBy({ by: ["userId"], where: { ...baseWhere, origem: "Tarefa" }, _count: { id: true } }),
    prisma.lojaNordPointTransaction.groupBy({ by: ["userId"], where: { ...baseWhere, origem: "Checklist" }, _count: { id: true } }),
    prisma.lojaNordPointTransaction.groupBy({ by: ["userId"], where: { ...baseWhere, origem: "Curso" }, _count: { id: true } }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const prevPosById = new Map(previous.map((p) => [p.userId, p.posicao]));
  const tarefasById = new Map(tarefasCount.map((t) => [t.userId, t._count.id]));
  const checklistsById = new Map(checklistsCount.map((t) => [t.userId, t._count.id]));
  const cursosById = new Map(cursosCount.map((t) => [t.userId, t._count.id]));

  // Loja/setor exibidos vêm da transação mais recente de cada usuário no período (aproximação simples e barata).
  const lastMeta = await prisma.lojaNordPointTransaction.findMany({
    where: { userId: { in: current.map((c) => c.userId) } },
    orderBy: { createdAt: "desc" },
    select: { userId: true, setor: true, empresa: { select: { name: true } } },
    distinct: ["userId"],
  });
  const metaById = new Map(lastMeta.map((m) => [m.userId, m]));

  const ranking = current.map((c) => {
    const user = userById.get(c.userId);
    const meta = metaById.get(c.userId);
    const prevPos = prevPosById.get(c.userId);
    return {
      userId: c.userId,
      nome: user?.name ?? "—",
      avatarUrl: user?.avatarUrl ?? null,
      setor: meta?.setor ?? null,
      loja: meta?.empresa.name ?? "-",
      pontos: c.pontos,
      posicao: c.posicao,
      tarefas: tarefasById.get(c.userId) ?? 0,
      checklists: checklistsById.get(c.userId) ?? 0,
      cursos: cursosById.get(c.userId) ?? 0,
      evolucao: range ? (prevPos === undefined ? null : prevPos - c.posicao) : null,
    };
  });

  return NextResponse.json({ ranking, meuUserId: session.user.id });
}
