import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeGoalStatus } from "@/lib/goals";
import { hasModulePermission } from "@/lib/authz";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "metas", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Metas." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const goals = await prisma.goal.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(category ? { category: category as never } : {}),
    },
    orderBy: { endDate: "asc" },
    include: { attachments: true, weeklyUpdates: { orderBy: { weekNumber: "asc" } } },
  });

  return NextResponse.json({ goals });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "metas", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar metas." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar metas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  const valorMeta = Number(body.valorMeta) || 0;
  const endDate = new Date(body.endDate);

  // `valorRealizado` nunca é aceito na criação: toda meta nova começa
  // zerada e só sobe através dos lançamentos semanais (ver
  // POST /api/metas/[id]/semanas) — nunca mais um número digitado direto
  // aqui, mesmo que o body envie um.
  const goal = await prisma.goal.create({
    data: {
      empresaId: empresa.id,
      name: body.name,
      category: body.category,
      responsavel: body.responsavel,
      description: body.description || null,
      indicador: body.indicador || null,
      valorMeta,
      unidade: body.unidade || "R$",
      startDate: new Date(body.startDate),
      endDate,
      bonificacao: body.bonificacao || null,
      status: computeGoalStatus(0, valorMeta, endDate) as never,
      observacoes: body.observacoes || null,
      planoDeAcao: body.planoDeAcao || null,
      createdById: session.user.id,
    },
    include: { attachments: true, weeklyUpdates: true },
  });

  return NextResponse.json({ goal });
}
