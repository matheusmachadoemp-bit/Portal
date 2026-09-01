import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PageContainer } from "@/components/page-container";
import { TarefasClient } from "./tarefas-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { generateDueTaskOccurrences } from "@/lib/tarefas-server";

const TASK_INCLUDE = {
  empresa: { select: { id: true, name: true, color: true } },
  createdBy: { select: { id: true, name: true } },
  validator: { select: { id: true, name: true } },
  assignees: { include: { user: { select: { id: true, name: true } } } },
  checklist: { orderBy: { order: "asc" as const } },
  _count: { select: { comments: true, attachments: true } },
};

export default async function TarefasPage() {
  const session = await auth();
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  await generateDueTaskOccurrences(empresaIds);

  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: TASK_INCLUDE,
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const now = Date.now();
  const serialized = tasks.map((t) => ({
    ...t,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    checklist: t.checklist.map((c) => ({ ...c, doneAt: c.doneAt ? c.doneAt.toISOString() : null })),
    overdue: !!t.dueDate && t.status !== "CONCLUIDA" && t.dueDate.getTime() < now,
  }));

  const empresas = ctx ? (ctx.mode === "single" ? [ctx.empresa] : ctx.empresas) : [];

  return (
    <PageContainer title="Tarefas" subtitle="Acompanhe e gerencie as tarefas da operação.">
      <TarefasClient
        initialTasks={serialized}
        users={users}
        empresas={empresas.map((e) => ({ id: e.id, name: e.name, color: e.color }))}
        currentUserId={session!.user.id}
        currentUserRole={session!.user.role}
      />
    </PageContainer>
  );
}
