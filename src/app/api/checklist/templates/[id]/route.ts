import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";

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

  await prisma.$transaction([
    prisma.checklistItemTemplate.deleteMany({ where: { templateId: id } }),
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
        itens: {
          create: (body.itens || []).map((item: Record<string, unknown>, idx: number) => ({
            title: item.title,
            orientacao: item.orientacao || null,
            tipo: item.tipo || "CONCLUIDO",
            obrigatorio: item.obrigatorio ?? true,
            fotoObrigatoria: Boolean(item.fotoObrigatoria),
            ordem: idx,
          })),
        },
      },
    }),
  ]);

  const updated = await prisma.checklistTemplate.findUnique({
    where: { id },
    include: { itens: { orderBy: { ordem: "asc" } } },
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
