import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { TasksClient } from "./tasks-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function TarefasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [tasks, teamMembers, campaigns] = await Promise.all([
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
  ]);

  const serialized = tasks.map((t) => ({ ...t, date: t.date ? t.date.toISOString() : null }));

  return (
    <PageContainer title="Marketing" subtitle="Tarefas">
      <TasksClient
        initialTasks={serialized as never}
        teamMembers={teamMembers}
        campaigns={campaigns}
        canCreate={ctx?.mode === "single"}
      />
    </PageContainer>
  );
}
