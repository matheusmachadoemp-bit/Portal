import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const empresaIds = empresaIdsForContext(ctx);

  const grouped = await prisma.checklistPontos.groupBy({
    by: ["userId"],
    where: { occurrence: { empresaId: { in: empresaIds } } },
    _sum: { pontos: true },
  });

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const ranking = grouped
    .map((g) => ({ userId: g.userId, name: nameById.get(g.userId) ?? "-", pontos: g._sum.pontos ?? 0 }))
    .sort((a, b) => b.pontos - a.pontos);

  return NextResponse.json({ ranking });
}
