import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { TarefasClient } from "./tarefas-client";
import { empresaIdsForContext, getActiveEmpresaContext, getSelectableTeamMembers } from "@/lib/empresa";
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
  if (!session?.user || !(await hasModulePermission(session.user.id, "tarefas", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  await generateDueTaskOccurrences(empresaIds);

  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: TASK_INCLUDE,
    }),
    getSelectableTeamMembers(empresaIds),
  ]);

  const serialized = tasks.map((t) => ({
    ...t,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    checklist: t.checklist.map((c) => ({ ...c, doneAt: c.doneAt ? c.doneAt.toISOString() : null })),
    // "Atrasada" depende da hora atual (Date.now()), que não pode ser calculada
    // aqui dentro (Server Component precisa ser puro). Só serializamos o dado
    // bruto (dueDate/status); quem calcula de verdade é o TarefasClient, no
    // navegador, sempre com a hora mais atual.
    overdue: false,
  }));

  const empresas = ctx ? (ctx.mode === "single" ? [ctx.empresa] : ctx.empresas) : [];

  return (
    <PageContainer title="Tarefas" subtitle="Acompanhe e gerencie as tarefas da operação.">
      <TarefasClient
        initialTasks={serialized}
        users={users}
        empresas={empresas.map((e) => ({ id: e.id, name: e.name, color: e.color }))}
        currentUserId={session.user.id}
        currentUserRole={session.user.role}
      />
    </PageContainer>
  );
}
