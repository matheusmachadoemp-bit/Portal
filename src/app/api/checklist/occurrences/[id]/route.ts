import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getActiveEmpresaContext, empresaIdsForContext } from "@/lib/empresa";
import { refreshOccurrenceStatuses } from "@/lib/checklist-server";

const DETAIL_INCLUDE = {
  template: { include: { itens: { orderBy: { ordem: "asc" as const } } } },
  empresa: { select: { id: true, name: true } },
  responsavel: { select: { id: true, name: true } },
  respostas: { include: { fotos: true } },
  fotos: true,
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { id } = await params;
  await refreshOccurrenceStatuses([id]);

  const occurrence = await prisma.checklistOccurrence.findFirst({
    where: { id, empresaId: { in: empresaIdsForContext(ctx) } },
    include: DETAIL_INCLUDE,
  });
  if (!occurrence) return NextResponse.json({ error: "Checklist não encontrado." }, { status: 404 });

  return NextResponse.json({ occurrence });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const occurrence = await prisma.checklistOccurrence.findFirst({
    where: { id, empresaId: { in: empresaIdsForContext(ctx) } },
  });
  if (!occurrence) return NextResponse.json({ error: "Checklist não encontrado." }, { status: 404 });

  const data: Record<string, unknown> = {};
  if ("responsavelId" in body) data.responsavelId = body.responsavelId || null;
  if ("justificativa" in body) data.justificativa = body.justificativa || null;
  if ("status" in body) data.status = body.status;

  const updated = await prisma.checklistOccurrence.update({ where: { id }, data });

  return NextResponse.json({ occurrence: updated });
}
