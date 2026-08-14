import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const segmentos = await prisma.crmSegment.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ segmentos });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para criar um segmento." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }

  const segmento = await prisma.crmSegment.create({
    data: {
      empresaId: empresa.id,
      name: String(body.name).trim(),
      description: body.description ? String(body.description) : null,
      criteria: body.criteria ?? {},
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ segmento });
}
