import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { TasksClient } from "./tasks-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function TarefasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [tasks, teamMembers, campaigns, history] = await Promise.all([
    prisma.marketingTask.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: [{ date: "asc" }, { order: "asc" }],
      include: {
        responsavel: { select: { id: true, name: true } },
        empresa: { select: { name: true, color: true } },
        comments: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.marketingCampaign.findMany({
      where: { empresaId: { in: empresaIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
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
        campaigns={campaigns}
        canCreate={ctx?.mode === "single"}
        history={serializedHistory}
      />
    </PageContainer>
  );
}
