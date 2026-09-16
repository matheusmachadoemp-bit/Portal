import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CalendarClient } from "./calendar-client";
import { empresaIdsForContext, getActiveEmpresaContext, getSelectableTeamMembers } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function CalendarioPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageMarketing = await hasModulePermission(session.user.id, "marketing", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageMarketing;

  const [tasks, teamMembers] = await Promise.all([
    prisma.marketingTask.findMany({
      where: { empresaId: { in: empresaIds }, date: { not: null } },
      orderBy: { date: "asc" },
      include: {
        responsavel: { select: { id: true, name: true } },
        empresa: { select: { name: true, color: true } },
        comments: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    getSelectableTeamMembers(empresaIds),
  ]);

  const serialized = tasks.map((t) => ({ ...t, date: t.date ? t.date.toISOString() : null }));

  return (
    <PageContainer title="Marketing" subtitle="Calendário de conteúdo">
      <CalendarClient
        initialTasks={serialized as never}
        teamMembers={teamMembers}
        canCreate={canCreate}
      />
    </PageContainer>
  );
}
