import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { TasksClient } from "./tasks-client";
import { empresaIdsForContext, getActiveEmpresaContext, getSelectableTeamMembers } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function TarefasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageMarketing = await hasModulePermission(session.user.id, "marketing", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageMarketing;
  const canDelete = await hasModulePermission(session.user.id, "marketing", "canDelete");

  const [tasks, teamMembers, history] = await Promise.all([
    prisma.marketingTask.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: [{ date: "asc" }, { order: "asc" }],
      include: {
        responsavel: { select: { id: true, name: true } },
        empresa: { select: { name: true, color: true } },
        comments: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    getSelectableTeamMembers(empresaIds),
    prisma.auditLog.findMany({
      where: { empresaId: { in: empresaIds }, entityType: "MarketingTask", action: { in: ["CREATE", "STATUS_CHANGE"] } },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const serialized = tasks.map((t) => ({ ...t, date: t.date ? t.date.toISOString() : null }));
  const serializedHistory = history.map((h) => ({
    id: h.id,
    action: h.action,
    before: h.before,
    after: h.after,
    userName: h.user?.name ?? "Sistema",
    createdAt: h.createdAt.toISOString(),
  }));

  return (
    <PageContainer title="Marketing" subtitle="Tarefas">
      <TasksClient
        initialTasks={serialized as never}
        teamMembers={teamMembers}
        canCreate={canCreate}
        canDelete={canDelete}
        history={serializedHistory}
      />
    </PageContainer>
  );
}
