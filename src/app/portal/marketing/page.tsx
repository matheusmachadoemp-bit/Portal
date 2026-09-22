import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { DashboardClient } from "./dashboard/dashboard-client";
import { empresaIdsForContext, getActiveEmpresaContext, getSelectableTeamMembers } from "@/lib/empresa";
import { startOfWeek, endOfWeek } from "date-fns";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function MarketingPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const now = new Date();
  const canManageMarketing = await hasModulePermission(session.user.id, "marketing", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageMarketing;
  // "Marcar como feita" e excluir agem sobre uma tarefa JÁ EXISTENTE (não têm
  // a ambiguidade de empresaId que "criar" tem no modo Grupo Nord), e cada
  // uma bate com a permissão exata que a rota de API já exige (PATCH exige
  // canEdit, DELETE exige canDelete) — mesmo padrão já corrigido em
  // Ideias/Parcerias/Tráfego Pago/Tarefas (commits a41cce2/42c97e9). Antes,
  // o botão de concluir usava `canCreate` (gated por loja única + create),
  // escondendo (ou implicando erroneamente "concluída") tarefas em aberto no
  // modo Grupo Nord e para perfis com canEdit=true/canCreate=false.
  const canEdit = await hasModulePermission(session.user.id, "marketing", "canEdit");
  const canDelete = await hasModulePermission(session.user.id, "marketing", "canDelete");

  const [weekTasks, recentFiles, recentLogs, allTasksForPanel, teamMembers] =
    await Promise.all([
      prisma.marketingTask.findMany({
        where: {
          empresaId: { in: empresaIds },
          date: { gte: startOfWeek(now, { weekStartsOn: 1 }), lte: endOfWeek(now, { weekStartsOn: 1 }) },
        },
        orderBy: { date: "asc" },
        include: { responsavel: { select: { name: true } }, empresa: { select: { name: true, color: true } } },
      }),
      prisma.marketingFile.findMany({
        where: { empresaId: { in: empresaIds } },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.auditLog.findMany({
        where: {
          empresaId: { in: empresaIds },
          entityType: { in: ["MarketingTask", "MarketingFile", "MarketingIdea"] },
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
      // Membros selecionáveis: usuários ativos com acesso à(s) empresa(s) do contexto ativo.
      getSelectableTeamMembers(empresaIds),
    ]);

  function serializeTask(t: (typeof weekTasks)[number]) {
    return { ...t, date: t.date ? t.date.toISOString() : null, createdAt: t.createdAt.toISOString() };
  }

  return (
    <PageContainer title="Marketing" subtitle={`Gestão de Marketing${ctx?.mode === "single" ? " - " + ctx.empresa.name : ""}`}>
      <DashboardClient
        weekTasks={weekTasks.map(serializeTask) as never}
        allTasks={allTasksForPanel.map(serializeTask) as never}
        recentFiles={recentFiles.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))}
        recentLogs={recentLogs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
        teamMembers={teamMembers}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </PageContainer>
  );
}
