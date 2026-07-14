import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const goals = await prisma.goal.findMany({
    where: category ? { category: category as never } : undefined,
    orderBy: { endDate: "asc" },
    include: { attachments: true },
  });

  return NextResponse.json({ goals });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const goal = await prisma.goal.create({
    data: {
      name: body.name,
      category: body.category,
      responsavel: body.responsavel,
      description: body.description || null,
      indicador: body.indicador || null,
      valorMeta: Number(body.valorMeta) || 0,
      valorRealizado: Number(body.valorRealizado) || 0,
      unidade: body.unidade || "R$",
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      bonificacao: body.bonificacao || null,
      status: body.status || "NAO_INICIADA",
      observacoes: body.observacoes || null,
      planoDeAcao: body.planoDeAcao || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ goal });
}
