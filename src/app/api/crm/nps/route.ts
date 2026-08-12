import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const respostas = await prisma.npsResponse.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { createdAt: "desc" },
    include: {
      cliente: { select: { nome: true } },
      empresa: { select: { name: true, color: true } },
      responsavel: { select: { name: true } },
    },
  });

  return NextResponse.json({ respostas });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) return NextResponse.json({ error: "Selecione uma loja específica." }, { status: 400 });

  const body = await req.json();
  const nota = Number(body.nota);
  if (Number.isNaN(nota) || nota < 0 || nota > 10) {
    return NextResponse.json({ error: "Nota deve ser entre 0 e 10." }, { status: 400 });
  }

  const resposta = await prisma.npsResponse.create({
    data: {
      empresaId: empresa.id,
      clienteId: body.clienteId || null,
      nota,
      comentario: body.comentario || null,
      status: "PENDENTE",
    },
  });

  return NextResponse.json({ resposta });
}
