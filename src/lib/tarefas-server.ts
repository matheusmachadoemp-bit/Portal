import { prisma } from "@/lib/prisma";
import { recurrenceMatchesDate } from "@/lib/tarefas";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseAssigneeIds(defaultAssigneeIds: string | null): string[] {
  return (defaultAssigneeIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Gera (de forma preguiçosa e idempotente) a ocorrência de hoje de cada
 * recorrência ativa que ainda não tem uma Task para essa data — chamado ao
 * abrir o dashboard de Tarefas. Protegido pelo índice único
 * (recurrenceId, dueDate): mesmo se rodar em paralelo, nunca duplica.
 */
export async function generateDueTaskOccurrences(empresaIds: string[], referenceDate = new Date()): Promise<void> {
  const recurrences = await prisma.taskRecurrence.findMany({
    where: { empresaId: { in: empresaIds }, active: true },
  });
  const due = recurrences.filter((r) => recurrenceMatchesDate(r, referenceDate));
  if (due.length === 0) return;

  const dueDate = startOfDay(referenceDate);

  // Uma única consulta batendo todas as recorrências de uma vez, em vez de uma por recorrência.
  const existing = await prisma.task.findMany({
    where: { recurrenceId: { in: due.map((r) => r.id) }, dueDate },
    select: { recurrenceId: true },
  });
  const existingRecurrenceIds = new Set(existing.map((t) => t.recurrenceId));
  const toCreate = due.filter((r) => !existingRecurrenceIds.has(r.id));
  if (toCreate.length === 0) return;

  const tasks = await Promise.all(
    toCreate.map((recurrence) => {
      const assigneeIds = parseAssigneeIds(recurrence.defaultAssigneeIds);
      return prisma.task.create({
        data: {
          empresaId: recurrence.empresaId,
          title: recurrence.title,
          description: recurrence.description,
          sectorKey: recurrence.sectorKey,
          priority: recurrence.priority,
          dueDate,
          dueTime: recurrence.dueTime,
          recurrenceId: recurrence.id,
          proofType: recurrence.proofType,
          requiresValidation: recurrence.requiresValidation,
          validatorId: recurrence.validatorId,
          sourceType: "MANUAL",
          createdById: recurrence.createdById,
          assignees: assigneeIds.length > 0 ? { create: assigneeIds.map((userId) => ({ userId })) } : undefined,
        },
      }).then((task) => ({ task, assigneeIds }));
    })
  );

  await prisma.taskHistory.createMany({
    data: tasks.map(({ task }) => ({
      taskId: task.id,
      userId: null,
      action: "CREATED",
      detail: "Gerada automaticamente pela recorrência",
    })),
  });

  await prisma.notification.createMany({
    data: tasks.flatMap(({ task, assigneeIds }) =>
      assigneeIds.map((userId) => ({
        userId,
        type: "NOVA_TAREFA",
        title: "Nova tarefa",
        body: `Você recebeu a tarefa "${task.title}".`,
        taskId: task.id,
      }))
    ),
  });
}

export async function logTaskHistory(taskId: string, userId: string | null, action: string, detail?: string | null): Promise<void> {
  await prisma.taskHistory.create({ data: { taskId, userId, action, detail: detail ?? null } });
}

export async function notifyUser(userId: string, type: string, title: string, body: string | null, taskId: string | null): Promise<void> {
  await prisma.notification.create({ data: { userId, type, title, body, taskId } });
}
