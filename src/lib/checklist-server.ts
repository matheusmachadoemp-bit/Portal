import { prisma } from "@/lib/prisma";
import { computeOccurrenceStatus, spDateKey, spDateTime, spStartOfDay, weekdayFieldFor } from "@/lib/checklist";

/**
 * Gera (de forma idempotente, via @@unique([templateId, date])) as
 * ocorrências do dia `dateKey` para os templates ativos das empresas
 * informadas — só nos dias da semana marcados no template.
 */
export async function generateChecklistOccurrences(empresaIds: string[], dateKey: string = spDateKey()) {
  if (empresaIds.length === 0) return;

  const day = spStartOfDay(dateKey);
  const weekdayField = weekdayFieldFor(dateKey);

  const templates = await prisma.checklistTemplate.findMany({
    where: {
      empresaId: { in: empresaIds },
      active: true,
      startDate: { lte: day },
      OR: [{ endDate: null }, { endDate: { gte: day } }],
      [weekdayField]: true,
    },
  });

  for (const t of templates) {
    const releaseAt = spDateTime(dateKey, t.releaseTime);
    const dueAt = spDateTime(dateKey, t.dueTime);
    await prisma.checklistOccurrence.upsert({
      where: { templateId_date: { templateId: t.id, date: day } },
      update: {},
      create: {
        templateId: t.id,
        empresaId: t.empresaId,
        date: day,
        releaseAt,
        dueAt,
        responsavelId: t.responsavelId,
      },
    });
  }
}

/** Recalcula (e persiste, se mudou) o status "ao vivo" de cada ocorrência. */
export async function refreshOccurrenceStatuses(occurrenceIds: string[]) {
  if (occurrenceIds.length === 0) return;
  const occurrences = await prisma.checklistOccurrence.findMany({ where: { id: { in: occurrenceIds } } });
  const now = new Date();
  await Promise.all(
    occurrences.map((o) => {
      const next = computeOccurrenceStatus({
        releaseAt: o.releaseAt,
        dueAt: o.dueAt,
        startedAt: o.startedAt,
        completedAt: o.completedAt,
        currentStatus: o.status,
        now,
      });
      if (next === o.status) return null;
      return prisma.checklistOccurrence.update({ where: { id: o.id }, data: { status: next } });
    })
  );
}
