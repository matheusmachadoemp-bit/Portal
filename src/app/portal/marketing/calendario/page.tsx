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
  // Excluir um conteúdo já existente não tem a ambiguidade de empresaId que
  // "criar" tem no modo Grupo Nord (o conteúdo já pertence a uma loja), então
  // não depende do modo de visualização — só da permissão real, igual ao
  // mesmo padrão já corrigido em Ideias/Parcerias/Tráfego Pago/Tarefas
  // (commits a41cce2/42c97e9). O TaskModal (compartilhado com Tarefas) já
  // suporta essa ação via a prop `canDelete`; só faltava esta tela repassar.
  const canDelete = await hasModulePermission(session.user.id, "marketing", "canDelete");

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
        canDelete={canDelete}
      />
    </PageContainer>
  );
}
