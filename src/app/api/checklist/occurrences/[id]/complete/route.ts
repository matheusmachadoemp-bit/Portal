import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getActiveEmpresaContext, empresaIdsForContext } from "@/lib/empresa";
import { CHECKLIST_PONTOS_POR_CONCLUSAO } from "@/lib/checklist";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { id } = await params;

  const occurrence = await prisma.checklistOccurrence.findFirst({
    where: { id, empresaId: { in: empresaIdsForContext(ctx) } },
    include: {
      template: { include: { itens: true } },
      respostas: { include: { fotos: true } },
      fotos: true,
    },
  });
  if (!occurrence) return NextResponse.json({ error: "Checklist não encontrado." }, { status: 404 });
  if (occurrence.completedAt) {
    return NextResponse.json({ error: "Esse checklist já foi concluído." }, { status: 400 });
  }

  const responseByItem = new Map(occurrence.respostas.map((r) => [r.itemTemplateId, r]));
  const itensAtivos = occurrence.template.itens.filter((item) => item.ativo);

  const pendentes = itensAtivos.filter((item) => {
    if (!item.obrigatorio) return false;
    const resp = responseByItem.get(item.id);
    return !resp || resp.status === "PENDENTE";
  });
  if (pendentes.length > 0) {
    return NextResponse.json(
      { error: `Ainda há itens obrigatórios pendentes: ${pendentes.map((i) => i.title).join(", ")}.` },
      { status: 400 }
    );
  }

  const semFotoObrigatoria = itensAtivos.filter((item) => {
    if (!item.fotoObrigatoria) return false;
    const resp = responseByItem.get(item.id);
    return !resp || resp.fotos.length === 0;
  });
  if (semFotoObrigatoria.length > 0) {
    return NextResponse.json(
      { error: `Falta foto obrigatória em: ${semFotoObrigatoria.map((i) => i.title).join(", ")}.` },
      { status: 400 }
    );
  }

  if (occurrence.template.fotoChecklist === "OBRIGATORIA" && occurrence.fotos.filter((f) => !f.itemResponseId).length === 0) {
    return NextResponse.json({ error: "Esse checklist exige uma foto geral antes de concluir." }, { status: 400 });
  }

  const now = new Date();
  const status = now.getTime() <= occurrence.dueAt.getTime() ? "CONCLUIDO_NO_PRAZO" : "CONCLUIDO_COM_ATRASO";

  const [updated] = await prisma.$transaction([
    prisma.checklistOccurrence.update({
      where: { id },
      data: { completedAt: now, status },
    }),
    ...(occurrence.responsavelId
      ? [
          prisma.checklistPontos.create({
            data: { userId: occurrence.responsavelId, occurrenceId: id, pontos: CHECKLIST_PONTOS_POR_CONCLUSAO },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({
    occurrence: updated,
    pontosGanhos: occurrence.responsavelId ? CHECKLIST_PONTOS_POR_CONCLUSAO : 0,
  });
}
