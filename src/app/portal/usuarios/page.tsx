import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { hasModulePermission } from "@/lib/authz";
import { UsuariosClient } from "./usuarios-client";
import { MODULES } from "@/lib/permissions";
import { getMenuCategories } from "@/lib/menu-categories";

export default async function UsuariosPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return (
      <PageContainer title="Usuários">
        <div className="nord-card p-8 text-center text-nord-gray">
          Você não tem permissão para acessar esta área.
        </div>
      </PageContainer>
    );
  }
  // Perfil de Permissão é uma camada ADICIONAL à checagem de cargo acima — permite que um
  // Administrador restrinja um GESTOR específico de ver Usuários, mesmo o cargo dele
  // normalmente permitindo (ver comentário em @/lib/authz).
  if (!(await hasModulePermission(session.user.id, "usuarios", "canView"))) {
    return (
      <PageContainer title="Usuários">
        <div className="nord-card p-8 text-center text-nord-gray">
          Você não tem permissão para acessar esta área.
        </div>
      </PageContainer>
    );
  }

  const [users, empresas, profiles, menuCategories] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      include: { permissions: true, empresaAccess: true },
    }),
    prisma.empresa.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    prisma.permissionProfile.findMany({ orderBy: { name: "asc" } }),
    getMenuCategories(),
  ]);

  const subcategoriesByModule = new Map(
    menuCategories.map((c) => [c.key, c.subcategories.filter((s) => s.active).map((s) => ({ key: s.key, label: s.name }))])
  );
  const modules = MODULES.map((m) => ({ ...m, subcategories: subcategoriesByModule.get(m.key) ?? [] }));

  const serialized = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    phone: u.phone,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    permissions: u.permissions.map((p) => ({ moduleKey: p.moduleKey, level: p.level })),
    empresaIds: u.empresaAccess.map((a) => a.empresaId),
    canViewGrupoNord: u.canViewGrupoNord,
    defaultEmpresaId: u.defaultEmpresaId,
    permissionProfileId: u.permissionProfileId,
  }));

  return (
    <PageContainer title="Usuários" subtitle="Gestão de acessos e permissões do portal">
      <UsuariosClient
        initialUsers={serialized}
        modules={modules}
        currentUserId={session.user.id}
        currentUserRole={session.user.role}
        empresas={empresas.map((e) => ({ id: e.id, name: e.name }))}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
      />
    </PageContainer>
  );
}
