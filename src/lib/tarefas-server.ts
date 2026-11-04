import type { NotificationPriority, Task, TaskPriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recurrenceMatchesDate } from "@/lib/tarefas";
import { createNotification, createNotifications } from "@/lib/notifications";

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

  await createNotifications(
    tasks.flatMap(({ task, assigneeIds }) =>
      assigneeIds.map((userId) => ({
        userId,
        type: "NOVA_TAREFA",
        title: "Nova tarefa",
        body: `Você recebeu a tarefa "${task.title}".`,
        taskId: task.id,
        url: "/portal/tarefas",
      }))
    )
  );
}

export async function logTaskHistory(taskId: string, userId: string | null, action: string, detail?: string | null): Promise<void> {
  await prisma.taskHistory.create({ data: { taskId, userId, action, detail: detail ?? null } });
}

/** Helper genérico de notificação, reaproveitado por vários módulos (Tarefas,
 * Loja Nord, Produção — ver notifyProducaoUsers em producao-server.ts) além
 * de Tarefas. Quando vem com taskId, o push abre a tela de Tarefas (mesmo
 * destino que o sino já usa pra esse caso — ver handleOpenNotification em
 * notification-bell.tsx); sem taskId, abre a Central do portal. */
export async function notifyUser(
  userId: string,
  type: string,
  title: string,
  body: string | null,
  taskId: string | null,
  priority?: NotificationPriority | null
): Promise<void> {
  await createNotification({ userId, type, title, body, priority: priority ?? null, taskId, url: taskId ? "/portal/tarefas" : "/portal" });
}

/**
 * Cria uma Task a partir de uma origem externa (fora do formulário rico de Tarefas) —
 * hoje usada por `POST /api/fechamento-dia/ocorrencias/[id]/transformar`, que "transforma"
 * uma FechamentoOcorrencia numa Task de acompanhamento. Extraída como função própria (em vez
 * de reaproveitar o corpo inteiro de `POST /api/tarefas`, que também lida com recorrência,
 * checklist e anexos vindos de um formulário completo — nada disso existe numa transformação
 * automática) para nunca reimplementar os efeitos colaterais que já existem
 * (`sourceType`/`sourceId` para rastrear a origem, `logTaskHistory`, notificar o responsável) —
 * só o `prisma.task.create` em si é uma chamada nova, com um subconjunto bem menor de campos.
 */
export async function createTaskFromExternalSource(params: {
  empresaId: string;
  title: string;
  description?: string | null;
  sectorKey: string;
  priority?: TaskPriority;
  assigneeId?: string | null;
  sourceType: string;
  sourceId: string;
  createdById: string;
}): Promise<Task> {
  const task = await prisma.task.create({
    data: {
      empresaId: params.empresaId,
      title: params.title,
      description: params.description ?? null,
      sectorKey: params.sectorKey,
      priority: params.priority ?? "MEDIA",
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      createdById: params.createdById,
      assignees: params.assigneeId ? { create: [{ userId: params.assigneeId }] } : undefined,
    },
  });
  await logTaskHistory(task.id, params.createdById, "CREATED", `Gerada automaticamente a partir de ${params.sourceType}`);
  if (params.assigneeId && params.assigneeId !== params.createdById) {
    await notifyUser(params.assigneeId, "NOVA_TAREFA", "Nova tarefa", `Você recebeu a tarefa "${task.title}".`, task.id);
  }
  return task;
}

/**
 * Cobrança automática de tarefa atrasada — disparada por `GET /api/tarefas/alertas/run`
 * (Vercel Cron, ver vercel.json), autenticado via CRON_SECRET. Mesma natureza/estrutura de
 * `processChamadoAtrasoAlertas` (@/lib/manutencao-server.ts) para o Chamado de manutenção: um
 * único aviso ("ficou atrasada, avisa quem está envolvido"), com a idempotência garantida por um
 * campo direto na própria linha (`Task.atrasoNotificadoEm`) em vez de uma tabela de log à parte —
 * aqui também não há vários níveis de escalonamento nem destinatários variáveis por nível.
 *
 * "Atrasada" usa o mesmo critério de `isTaskOverdue`/`effectiveTaskStatus` (@/lib/tarefas.ts):
 * `dueDate` vencido e status != CONCLUIDA — só que aqui expresso como filtro de banco (`where`),
 * não reaproveitando a função (que espera um objeto já carregado), para poder filtrar direto na
 * query em vez de buscar todas as tarefas da empresa e filtrar em memória.
 *
 * Destinatários: todo responsável atribuído (`TaskAssignee`) + quem criou a tarefa (se ainda não
 * estiver entre os responsáveis) — diferente do Chamado (que soma "donos" fixos/ADMINISTRADOR),
 * Tarefas não tem um "dono do módulo" global por loja; quem precisa saber que atrasou é quem foi
 * designado para executá-la e quem a criou.
 */
export async function processTaskAtrasoAlertas(): Promise<{ notified: number; tarefasAtrasadas: number }> {
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { lt: now },
      status: { not: "CONCLUIDA" },
      atrasoNotificadoEm: null,
      // Mesmo filtro de `processChamadoAtrasoAlertas`/`processFechamentoAlertas` — uma loja
      // desativada nunca aparece em nenhuma tela, então uma tarefa dela não deveria gerar aviso.
      empresa: { active: true },
    },
    select: {
      id: true,
      title: true,
      createdById: true,
      empresa: { select: { name: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (tasks.length === 0) return { notified: 0, tarefasAtrasadas: 0 };

  let notified = 0;
  for (const task of tasks) {
    const recipientIds = new Set<string>(task.assignees.map((a) => a.userId));
    recipientIds.add(task.createdById);

    const title = "Tarefa atrasada";
    const body = `A tarefa "${task.title}" passou do prazo — ${task.empresa.name}.`;
    await Promise.all([...recipientIds].map((userId) => notifyUser(userId, "TAREFA_ATRASADA", title, body, task.id, "ATENCAO")));
    notified += recipientIds.size;

    // Marca como avisada mesmo se por algum motivo não houvesse destinatário (hipotético, já que
    // createdById é sempre preenchido) — evita reprocessar a mesma tarefa pra sempre; volta a
    // null (novo aviso liberado) se o prazo for alterado — ver PATCH /api/tarefas/[id].
    await prisma.task.update({ where: { id: task.id }, data: { atrasoNotificadoEm: now } });
  }

  return { notified, tarefasAtrasadas: tasks.length };
}
