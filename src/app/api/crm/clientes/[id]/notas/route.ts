import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const cliente = await prisma.cliente.findFirst({ where: { id, empresaId: { in: empresaIdsForContext(ctx) } } });
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const body = await req.json();
  if (!body.texto || !String(body.texto).trim()) {
    return NextResponse.json({ error: "Texto é obrigatório." }, { status: 400 });
  }

  const nota = await prisma.customerNote.create({
    data: {
      empresaId: cliente.empresaId,
      clienteId: cliente.id,
      texto: String(body.texto).trim(),
      authorId: session.user.id,
    },
    include: { author: { select: { name: true } } },
  });

  return NextResponse.json({ nota });
}
