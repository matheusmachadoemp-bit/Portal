import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { FilesClient } from "../biblioteca/files-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function DrivePage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const files = await prisma.marketingFile.findMany({
    where: { empresaId: { in: empresaIds }, space: "drive" },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } }, empresa: { select: { name: true } } },
  });

  const serialized = files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }));

  return (
    <PageContainer title="Marketing" subtitle="Google Drive">
      <FilesClient initialFiles={serialized} canCreate={ctx?.mode === "single"} space="drive" />
    </PageContainer>
  );
}
