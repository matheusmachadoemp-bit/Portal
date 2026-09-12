import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { FilesClient } from "./files-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function BibliotecaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const files = await prisma.marketingFile.findMany({
    where: { empresaId: { in: empresaIds }, space: "biblioteca" },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } }, empresa: { select: { name: true } } },
  });

  const serialized = files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }));

  return (
    <PageContainer title="Marketing" subtitle="Biblioteca de arquivos">
      <FilesClient initialFiles={serialized} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
