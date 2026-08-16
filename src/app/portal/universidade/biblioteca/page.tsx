import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { LibraryClient } from "./library-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function BibliotecaPage() {
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
