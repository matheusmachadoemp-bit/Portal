import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { UsuariosClient } from "./usuarios-client";
import { MODULES } from "@/lib/permissions";

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

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    include: { permissions: true },
  });

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
  }));

  return (
    <PageContainer title="Usuários" subtitle="Gestão de acessos e permissões do portal">
      <UsuariosClient initialUsers={serialized} modules={MODULES} currentUserId={session.user.id} />
    </PageContainer>
  );
}
