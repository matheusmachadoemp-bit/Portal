import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { FilesManager } from "@/components/files-manager";

// Mesma proteção e mesmo motivo de administrativo/cursos/page.tsx: sem este check, qualquer
// usuário logado digitando a URL direto recebia o HTML já renderizado com a biblioteca de
// logos. Cargo (mesma checagem das rotas irmãs `/api/admin/files/**`) + hasModulePermission no
// módulo "administrativo" (perfil só restringe além do cargo, nunca libera além dele).
export default async function LogoPage() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") ||
    !(await hasModulePermission(session.user.id, "administrativo", "canView"))
  ) {
    redirect("/portal/inicio");
  }

  const files = await prisma.fileItem.findMany({
    where: { folderType: "LOGO" },
    orderBy: [{ isFolder: "desc" }, { name: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });
  const serialized = files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }));

  return (
    <PageContainer title="Administrativo" subtitle="Biblioteca de identidade visual da Nord">
      <div className="space-y-6">
        <FilesManager folderType="LOGO" initialFiles={serialized} />
      </div>
    </PageContainer>
  );
}
