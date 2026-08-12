import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const segmento = await prisma.crmSegment.findFirst({ where: { id, empresaId: { in: empresaIdsForContext(ctx) } } });
  if (!segmento) return NextResponse.json({ error: "Segmento não encontrado." }, { status: 404 });

  await prisma.crmSegment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
