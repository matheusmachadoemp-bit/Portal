import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  const counts = await prisma.stockCount.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) }, ...(type ? { type: type as never } : {}) },
    orderBy: { dataContagem: "desc" },
    take: 100,
    include: {
      empresa: { select: { id: true, name: true, color: true } },
      items: { include: { ingredient: { select: { id: true, name: true, unidade: true, categoryId: true } } } },
      createdBy: { select: { name: true } },
    },
  });
  return NextResponse.json({ counts });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para iniciar uma contagem." }, { status: 400 });
  }

  const body = await req.json();
  const type = body.type === "MENSAL" ? "MENSAL" : "SEMANAL";
  const now = new Date();

  const ingredients = await prisma.ingredient.findMany({
    where: { empresaId: empresa.id, active: true, ...(type === "SEMANAL" && body.setor ? { setor: body.setor } : {}) },
    orderBy: { name: "asc" },
  });

  const count = await prisma.stockCount.create({
    data: {
      empresaId: empresa.id,
      type,
      setor: type === "SEMANAL" ? body.setor || null : null,
      semana: body.semana ? Number(body.semana) : null,
      mes: type === "MENSAL" ? now.getMonth() + 1 : null,
      ano: body.ano ? Number(body.ano) : now.getFullYear(),
      responsavel: body.responsavel || session.user.name || null,
      horaInicio: body.horaInicio || now.toTimeString().slice(0, 5),
      status: "EM_ANDAMENTO",
      checklistJson: type === "MENSAL" ? JSON.stringify({}) : null,
      createdById: session.user.id,
      items: {
        create: ingredients.map((ing) => ({
          ingredientId: ing.id,
          setor: ing.setor,
          estoqueEsperado: ing.estoqueAtual,
        })),
      },
    },
    include: { items: { include: { ingredient: true } } },
  });

  return NextResponse.json({ count });
}
