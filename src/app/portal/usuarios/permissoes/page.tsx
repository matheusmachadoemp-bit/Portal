import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MODULES } from "@/lib/permissions";
import { PermissoesClient } from "./permissoes-client";

export default async function PermissoesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return (
      <PageContainer title="Permissões" backHref="/portal/usuarios" backLabel="Usuários">
        <div className="nord-card p-8 text-center text-nord-gray">Você não tem permissão para acessar esta área.</div>
      </PageContainer>
    );
  }

  const profiles = await prisma.permissionProfile.findMany({
    orderBy: { name: "asc" },
    include: { modulePermissions: true },
  });

  const serialized = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    modulePermissions: p.modulePermissions.map((m) => ({
      moduleKey: m.moduleKey,
      canView: m.canView,
      canCreate: m.canCreate,
      canEdit: m.canEdit,
      canDelete: m.canDelete,
    })),
  }));

  return (
    <PageContainer title="Permissões" subtitle="Perfis de acesso por módulo" backHref="/portal/usuarios" backLabel="Usuários">
      <PermissoesClient initialProfiles={serialized} modules={MODULES} />
    </PageContainer>
  );
}
