import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ExecutarClient } from "./executar-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { refreshOccurrenceStatuses } from "@/lib/checklist-server";

const DETAIL_INCLUDE = {
  template: { include: { itens: { where: { ativo: true }, orderBy: { ordem: "asc" as const } } } },
  empresa: { select: { id: true, name: true } },
  responsavel: { select: { id: true, name: true } },
  respostas: { include: { fotos: true } },
  fotos: true,
};

export default async function ExecutarChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  await refreshOccurrenceStatuses([id]);

  const occurrence = await prisma.checklistOccurrence.findFirst({
    where: { id, empresaId: { in: empresaIds } },
    include: DETAIL_INCLUDE,
  });
  if (!occurrence) notFound();

  const serialized = {
    ...occurrence,
    date: occurrence.date.toISOString(),
    releaseAt: occurrence.releaseAt.toISOString(),
    dueAt: occurrence.dueAt.toISOString(),
    startedAt: occurrence.startedAt ? occurrence.startedAt.toISOString() : null,
    completedAt: occurrence.completedAt ? occurrence.completedAt.toISOString() : null,
    createdAt: occurrence.createdAt.toISOString(),
    updatedAt: occurrence.updatedAt.toISOString(),
    template: {
      ...occurrence.template,
      startDate: occurrence.template.startDate.toISOString(),
      endDate: occurrence.template.endDate ? occurrence.template.endDate.toISOString() : null,
      createdAt: occurrence.template.createdAt.toISOString(),
      updatedAt: occurrence.template.updatedAt.toISOString(),
      itens: occurrence.template.itens.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
    },
    respostas: occurrence.respostas.map((r) => ({
      ...r,
      respondidoEm: r.respondidoEm ? r.respondidoEm.toISOString() : null,
      fotos: r.fotos.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })),
    })),
    fotos: occurrence.fotos.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })),
  };

  return (
    <PageContainer title="Checklist" subtitle={occurrence.template.name}>
      <ExecutarClient occurrence={serialized} />
    </PageContainer>
  );
}
