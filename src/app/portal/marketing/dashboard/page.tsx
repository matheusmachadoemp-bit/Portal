import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { DashboardClient } from "./dashboard-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks } from "date-fns";

export default async function MarketingDashboardPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const now = new Date();

  const [tasksThisMonth, weekTasks, activeCampaigns, recentFiles, recentLogs, allTasksForPanel, teamMembers] =
    await Promise.all([
      prisma.marketingTask.findMany({
        where: { empresaId: { in: empresaIds }, createdAt: { gte: startOfMonth(now), lte: endOfMonth(now) } },
        select: { id: true, status: true, createdAt: true },
      }),
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

  // 6-week sparkline trend, by week, of tasks created
  const sparklineWeeks: { done: number; producing: number; analysis: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    const inWeek = tasksThisMonth.filter((t) => t.createdAt >= weekStart && t.createdAt <= weekEnd);
    sparklineWeeks.push({
      done: inWeek.filter((t) => t.status === "PUBLICADO" || t.status === "RESULTADOS").length,
      producing: inWeek.filter((t) => t.status === "A_PRODUZIR" || t.status === "EM_PRODUCAO").length,
      analysis: inWeek.filter((t) => t.status === "EM_ANALISE").length,
    });
  }

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
        sparklineWeeks={sparklineWeeks}
        teamMembers={teamMembers}
        canCreate={ctx?.mode === "single"}
      />
    </PageContainer>
  );
}
