import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ChecklistClient } from "./checklist-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { generateChecklistOccurrences, processChecklistEscalations, refreshOccurrenceStatuses } from "@/lib/checklist-server";
import { spDateKey, spStartOfDay } from "@/lib/checklist";

const OCCURRENCE_INCLUDE = {
  template: {
    select: {
      id: true,
      name: true,
      setor: true,
      turno: true,
      fotoChecklist: true,
      empresa: { select: { id: true, name: true } },
    },
  },
  responsavel: { select: { id: true, name: true } },
};

export default async function ChecklistPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const dateKey = spDateKey();

  await generateChecklistOccurrences(empresaIds, dateKey);

  const day = spStartOfDay(dateKey);
  const existing = await prisma.checklistOccurrence.findMany({
    where: { empresaId: { in: empresaIds } },
    select: { id: true },
  });
  await refreshOccurrenceStatuses(existing.map((o) => o.id));
  await processChecklistEscalations(existing.map((o) => o.id));

  const [occurrences, templates, users] = await Promise.all([
    prisma.checklistOccurrence.findMany({
      where: { empresaId: { in: empresaIds }, date: day },
      include: OCCURRENCE_INCLUDE,
      orderBy: { dueAt: "asc" },
    }),
    prisma.checklistTemplate.findMany({
      where: { empresaId: { in: empresaIds } },
      include: {
        itens: { where: { ativo: true }, orderBy: { ordem: "asc" } },
        responsavel: { select: { id: true, name: true } },
        substituto: { select: { id: true, name: true } },
        empresa: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const serializedOccurrences = occurrences.map((o) => ({
    ...o,
    date: o.date.toISOString(),
    releaseAt: o.releaseAt.toISOString(),
    dueAt: o.dueAt.toISOString(),
    startedAt: o.startedAt ? o.startedAt.toISOString() : null,
    completedAt: o.completedAt ? o.completedAt.toISOString() : null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  }));

  const serializedTemplates = templates.map((t) => ({
    ...t,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate ? t.endDate.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    itens: t.itens.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
  }));

  return (
    <PageContainer title="Checklists" subtitle="Acompanhe rotinas, responsáveis, horários e comprovações.">
      <ChecklistClient
        initialOccurrences={serializedOccurrences}
        initialTemplates={serializedTemplates}
        users={users}
        dateKey={dateKey}
        canCreate={ctx?.mode === "single"}
      />
    </PageContainer>
  );
}
