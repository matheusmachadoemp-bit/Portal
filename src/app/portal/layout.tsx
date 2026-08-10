import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/sidebar/sidebar";
import { redirect } from "next/navigation";
import { getActiveEmpresaContext } from "@/lib/empresa";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [categories, empresaContext] = await Promise.all([
    prisma.category.findMany({
      orderBy: { order: "asc" },
      include: { subcategories: { orderBy: { order: "asc" } } },
    }),
    getActiveEmpresaContext(),
  ]);

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
  );
}
