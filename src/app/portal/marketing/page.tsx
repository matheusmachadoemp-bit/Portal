import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { DashboardClient } from "./dashboard/dashboard-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { startOfWeek, endOfWeek } from "date-fns";

export default async function MarketingPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const now = new Date();

  const [weekTasks, activeCampaigns, recentFiles, recentLogs, allTasksForPanel, teamMembers] =
    await Promise.all([
      prisma.marketingTask.findMany({
        where: {
          empresaId: { in: empresaIds },
          date: { gte: startOfWeek(now, { weekStartsOn: 1 }), lte: endOfWeek(now, { weekStartsOn: 1 }) },
        },
        orderBy: { date: "asc" },
        include: { responsavel: { select: { name: true } }, empresa: { select: { name: true, color: true } } },
      }),
      prisma.marketingCampaign.count({
        where: { empresaId: { in: empresaIds }, status: { in: ["EM_ANDAMENTO", "PLANEJADA"] } },
      }),
      prisma.marketingFile.findMany({
        where: { empresaId: { in: empresaIds } },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.auditLog.findMany({
        where: {
          empresaId: { in: empresaIds },
          entityType: { in: ["MarketingTask", "MarketingCampaign", "MarketingFile", "MarketingIdea"] },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { user: { select: { name: true } } },
      }),
      // Painel geral de tarefas
      prisma.marketingTask.findMany({
        where: { empresaId: { in: empresaIds } },
        orderBy: { date: "asc" },
        include: { responsavel: { select: { name: true } }, empresa: { select: { name: true, color: true } } },
        take: 200,
      }),
      // Membros selecionáveis (qualquer usuário com acesso às empresas ativas)
      prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

  function serializeTask(t: (typeof weekTasks)[number]) {
    return { ...t, date: t.date ? t.date.toISOString() : null, createdAt: t.createdAt.toISOString() };
  }

  return (
    <PageContainer title="Marketing" subtitle={`Gestão de Marketing${ctx?.mode === "single" ? " - " + ctx.empresa.name : ""}`}>
      <DashboardClient
        weekTasks={weekTasks.map(serializeTask) as never}
        allTasks={allTasksForPanel.map(serializeTask) as never}
        activeCampaigns={activeCampaigns}
        recentFiles={recentFiles.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))}
        recentLogs={recentLogs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
        teamMembers={teamMembers}
        canCreate={ctx?.mode === "single"}
      />
    </PageContainer>
  );
}
