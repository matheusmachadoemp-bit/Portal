import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getActiveEmpresaContext, empresaIdsForContext } from "@/lib/empresa";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { itemTemplateId, status, valorTexto, valorNumero, valorBooleano, observacao } = body;

  const occurrence = await prisma.checklistOccurrence.findFirst({
    where: { id, empresaId: { in: empresaIdsForContext(ctx) } },
    include: { template: true },
  });
  if (!occurrence) return NextResponse.json({ error: "Checklist não encontrado." }, { status: 404 });

  if (status === "PROBLEMA" && occurrence.template.exigirObservacaoProblema && !observacao?.trim()) {
    return NextResponse.json({ error: "Esse checklist exige uma observação quando há um problema." }, { status: 400 });
  }

  const response = await prisma.checklistItemResponse.upsert({
    where: { occurrenceId_itemTemplateId: { occurrenceId: id, itemTemplateId } },
    update: {
      status: status || "CONCLUIDO",
      valorTexto: valorTexto ?? null,
      valorNumero: valorNumero != null ? Number(valorNumero) : null,
      valorBooleano: valorBooleano ?? null,
      observacao: observacao || null,
      respondidoPorId: session.user.id,
      respondidoEm: new Date(),
    },
    create: {
      occurrenceId: id,
      itemTemplateId,
      status: status || "CONCLUIDO",
      valorTexto: valorTexto ?? null,
      valorNumero: valorNumero != null ? Number(valorNumero) : null,
      valorBooleano: valorBooleano ?? null,
      observacao: observacao || null,
      respondidoPorId: session.user.id,
      respondidoEm: new Date(),
    },
  });

  if (!occurrence.startedAt) {
    await prisma.checklistOccurrence.update({ where: { id }, data: { startedAt: new Date() } });
  }

  return NextResponse.json({ response });
}
