import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import type { ChecklistItemType } from "@prisma/client";

const WEEKDAYS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível editar checklists no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const body = await req.json();

  const weekdayData = Object.fromEntries(WEEKDAYS.map((d) => [d, Boolean(body[d])]));
  const incomingItens: Record<string, unknown>[] = body.itens || [];

  const existingItens = await prisma.checklistItemTemplate.findMany({
    where: { templateId: id },
    select: { id: true, _count: { select: { respostas: true } } },
  });
  const incomingIds = new Set(incomingItens.map((item) => item.id).filter(Boolean));
  const removedItens = existingItens.filter((item) => !incomingIds.has(item.id));
  const removedIdsToDelete = removedItens.filter((item) => item._count.respostas === 0).map((item) => item.id);
  const removedIdsToDeactivate = removedItens.filter((item) => item._count.respostas > 0).map((item) => item.id);

  await prisma.$transaction([
    // Itens sem histórico podem ser removidos de verdade; itens já respondidos
    // em alguma execução são só desativados, para nunca apagar o histórico.
    ...(removedIdsToDelete.length
      ? [prisma.checklistItemTemplate.deleteMany({ where: { id: { in: removedIdsToDelete } } })]
      : []),
    ...(removedIdsToDeactivate.length
      ? [prisma.checklistItemTemplate.updateMany({ where: { id: { in: removedIdsToDeactivate } }, data: { ativo: false } })]
      : []),
    ...incomingItens.map((item, idx) =>
      item.id
        ? prisma.checklistItemTemplate.update({
            where: { id: item.id as string },
            data: {
              title: item.title as string,
              orientacao: (item.orientacao as string) || null,
              tipo: ((item.tipo as string) || "CONCLUIDO") as ChecklistItemType,
              obrigatorio: (item.obrigatorio as boolean) ?? true,
              fotoObrigatoria: Boolean(item.fotoObrigatoria),
              ordem: idx,
              ativo: true,
            },
          })
        : prisma.checklistItemTemplate.create({
            data: {
              templateId: id,
              title: item.title as string,
              orientacao: (item.orientacao as string) || null,
              tipo: ((item.tipo as string) || "CONCLUIDO") as ChecklistItemType,
              obrigatorio: (item.obrigatorio as boolean) ?? true,
              fotoObrigatoria: Boolean(item.fotoObrigatoria),
              ordem: idx,
            },
          })
    ),
    prisma.checklistTemplate.update({
      where: { id, empresaId: empresa.id },
      data: {
        name: body.name,
        description: body.description || null,
        setor: body.setor,
        categoria: body.categoria || null,
        turno: body.turno || null,
        active: body.active ?? true,
        recurrence: body.recurrence || "DIARIA",
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        releaseTime: body.releaseTime,
        dueTime: body.dueTime,
        ...weekdayData,
        responsavelId: body.responsavelId || null,
        substitutoId: body.substitutoId || null,
        substituirAutomaticamente: Boolean(body.substituirAutomaticamente),
        fotoChecklist: body.fotoChecklist || "SEM_FOTO",
        exigirObservacaoProblema: Boolean(body.exigirObservacaoProblema),
        cobrancaAtiva: body.cobrancaAtiva ?? true,
        avisoAntesMinutos: Number(body.avisoAntesMinutos) || 30,
        avisoAtrasoResponsavelMinutos: Number(body.avisoAtrasoResponsavelMinutos) || 10,
        alertaCriticoMinutos: Number(body.alertaCriticoMinutos) || 30,
        naoRealizadoMinutos: Number(body.naoRealizadoMinutos) || 60,
      },
    }),
  ]);

  const updated = await prisma.checklistTemplate.findUnique({
    where: { id },
    include: { itens: { where: { ativo: true }, orderBy: { ordem: "asc" } } },
  });

  return NextResponse.json({ template: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica." }, { status: 400 });
  }

  const { id } = await params;

  const occurrenceCount = await prisma.checklistOccurrence.count({ where: { templateId: id } });
  if (occurrenceCount > 0) {
    return NextResponse.json(
      { error: "Esse checklist já tem execuções registradas — desative em vez de excluir, para preservar o histórico." },
      { status: 400 }
    );
  }

  await prisma.checklistTemplate.delete({ where: { id, empresaId: empresa.id } });

  return NextResponse.json({ ok: true });
}
