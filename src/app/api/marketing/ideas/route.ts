import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const ideas = await prisma.marketingIdea.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } }, empresa: { select: { name: true } } },
  });

  return NextResponse.json({ ideas });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: "Título é obrigatório." }, { status: 400 });
  }

  const idea = await prisma.marketingIdea.create({
    data: {
      empresaId: empresa.id,
      title: body.title,
      description: body.description || null,
      references: body.references || null,
      links: body.links || null,
      category: body.category || null,
      tags: body.tags || null,
      status: body.status || "NOVA",
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ idea });
}
