import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; notaId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, notaId } = await params;
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const nota = await prisma.customerNote.findFirst({
    where: { id: notaId, clienteId: id, empresaId: { in: empresaIdsForContext(ctx) } },
  });
  if (!nota) return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });

  await prisma.customerNote.delete({ where: { id: notaId } });
  return NextResponse.json({ ok: true });
}
