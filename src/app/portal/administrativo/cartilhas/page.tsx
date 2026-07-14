import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { AdminTabs } from "../admin-tabs";
import { FilesManager } from "@/components/files-manager";

export default async function CartilhasPage() {
  const files = await prisma.fileItem.findMany({
    where: { folderType: "CARTILHA" },
    orderBy: [{ isFolder: "desc" }, { name: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });
  const serialized = files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }));

  return (
    <PageContainer title="Administrativo" subtitle="Cartilhas e materiais de treinamento">
      <div className="space-y-6">
        <AdminTabs />
        <FilesManager folderType="CARTILHA" initialFiles={serialized} />
      </div>
    </PageContainer>
  );
}
