import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { AdminTabs } from "../admin-tabs";
import { FilesManager } from "@/components/files-manager";

export default async function ArquivosPage() {
  const files = await prisma.fileItem.findMany({
    where: { folderType: "ARQUIVO" },
    orderBy: [{ isFolder: "desc" }, { name: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });
  const serialized = files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }));

  return (
    <PageContainer title="Administrativo" subtitle="Gerenciador de arquivos">
      <div className="space-y-6">
        <AdminTabs />
        <FilesManager folderType="ARQUIVO" initialFiles={serialized} />
      </div>
    </PageContainer>
  );
}
