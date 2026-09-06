import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/sidebar/sidebar";
import { MobileSidebarProvider } from "@/components/sidebar/mobile-sidebar-context";
import { redirect } from "next/navigation";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { visibleModuleKeys } from "@/lib/permissions";
import { getMenuCategories } from "@/lib/menu-categories";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [allCategories, empresaContext, dbUser] = await Promise.all([
    getMenuCategories(),
    getActiveEmpresaContext(),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { permissionProfile: { select: { modulePermissions: { select: { moduleKey: true, canView: true } } } } },
    }),
  ]);

  const visible = visibleModuleKeys(session.user.role, dbUser?.permissionProfile?.modulePermissions);
  const categories = visible ? allCategories.filter((c) => visible.has(c.key)) : allCategories;

  if (!empresaContext) {
    return (
      <div className="min-h-screen w-full bg-nord-black flex items-center justify-center p-6">
        <div className="nord-card p-8 max-w-md text-center">
          <h1 className="text-white text-lg font-semibold mb-2">Sem acesso a nenhuma loja</h1>
          <p className="text-nord-gray text-sm">
            Seu usuário ainda não tem acesso a nenhuma empresa do Grupo Nord. Peça a um
            administrador para liberar o acesso em Usuários.
          </p>
        </div>
      </div>
    );
  }

  return (
    <MobileSidebarProvider>
      <div className="flex min-h-screen w-full bg-nord-black">
        <Sidebar
          initialCategories={categories}
          userName={session.user.name ?? session.user.email ?? "Usuário"}
          userRole={session.user.role}
          empresas={empresaContext.empresas}
          activeEmpresaId={empresaContext.mode === "single" ? empresaContext.empresa.id : "GRUPO"}
          canViewGrupoNord={empresaContext.canViewGrupoNord}
        />
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </MobileSidebarProvider>
  );
}
