import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeGoalStatus } from "@/lib/goals";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    include: { attachments: true },
  });

  return NextResponse.json({ goals });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar metas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  const valorMeta = Number(body.valorMeta) || 0;
  const valorRealizado = Number(body.valorRealizado) || 0;
  const endDate = new Date(body.endDate);

  const goal = await prisma.goal.create({
    data: {
      empresaId: empresa.id,
      name: body.name,
      category: body.category,
      responsavel: body.responsavel,
      description: body.description || null,
      indicador: body.indicador || null,
      valorMeta,
      valorRealizado,
      unidade: body.unidade || "R$",
      startDate: new Date(body.startDate),
      endDate,
      bonificacao: body.bonificacao || null,
      status: computeGoalStatus(valorRealizado, valorMeta, endDate) as never,
      observacoes: body.observacoes || null,
      planoDeAcao: body.planoDeAcao || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ goal });
}
