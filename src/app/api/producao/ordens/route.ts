import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "producao", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Produção." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const categoria = searchParams.get("categoria");
  const prioridade = searchParams.get("prioridade");
  const responsavelId = searchParams.get("responsavelId");
  const status = searchParams.get("status");
  const q = searchParams.get("q");

  const date = dateParam ? new Date(dateParam) : new Date();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const where: Record<string, unknown> = { empresaId: { in: empresaIds }, date: { gte: dayStart, lt: dayEnd } };
  if (prioridade) where.prioridade = prioridade;
  if (responsavelId) where.responsavelId = responsavelId;
  if (status && status !== "ATRASADO") where.status = status;
  if (categoria || q) {
    where.productionItem = {
      ...(categoria ? { categoryId: categoria } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    };
  }

  const ordens = await prisma.productionOrder.findMany({
    where,
    orderBy: { prazo: "asc" },
    include: {
      productionItem: { include: { category: { select: { id: true, name: true, color: true, icon: true } } } },
      responsavel: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ ordens });
}
