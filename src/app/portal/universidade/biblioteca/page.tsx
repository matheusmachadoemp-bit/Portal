import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { LibraryClient } from "./library-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function BibliotecaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "universidade", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const items = await prisma.trainingLibraryItem.findMany({
    where: { OR: [{ empresaId: null }, { empresaId: { in: empresaIds } }] },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  const serialized = items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }));

  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Biblioteca">
      <LibraryClient initialItems={serialized} />
    </PageContainer>
  );
}
