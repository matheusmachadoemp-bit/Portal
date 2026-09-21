import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PageContainer } from "@/components/page-container";
import { FilesManager } from "@/components/files-manager";

// Mesma checagem de cargo já usada pela API irmã (GET /api/admin/files): sem ela, qualquer
// usuário autenticado (de qualquer cargo) conseguia ver todos os arquivos administrativos
// direto nesta página Server Component, já que ela busca via Prisma direto, sem passar pela
// API (achado #229, mesma classe do BUG-004 já corrigido em rh/colaboradores/page.tsx).
export default async function ArquivosPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR")) {
    redirect("/portal/inicio");
  }

  const files = await prisma.fileItem.findMany({
    where: { folderType: "ARQUIVO" },
    orderBy: [{ isFolder: "desc" }, { name: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });
  const serialized = files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }));

  return (
    <PageContainer title="Administrativo" subtitle="Gerenciador de arquivos">
      <div className="space-y-6">
        <FilesManager folderType="ARQUIVO" initialFiles={serialized} />
      </div>
    </PageContainer>
  );
}
