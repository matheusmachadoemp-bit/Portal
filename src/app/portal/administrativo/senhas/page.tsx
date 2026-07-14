import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { AdminTabs } from "../admin-tabs";
import { SenhasClient } from "./senhas-client";

export default async function SenhasPage() {
  const entries = await prisma.vaultEntry.findMany({
    orderBy: { systemName: "asc" },
    include: { createdBy: { select: { name: true } } },
  });

  const serialized = entries.map((e) => ({
    id: e.id,
    systemName: e.systemName,
    site: e.site,
    username: e.username,
    category: e.category,
    responsavel: e.responsavel,
    observacao: e.observacao,
    updatedAt: e.updatedAt.toISOString(),
    createdBy: e.createdBy.name,
  }));

  return (
    <PageContainer title="Administrativo" subtitle="Cofre de senhas — acesso restrito e criptografado">
      <div className="space-y-6">
        <AdminTabs />
        <SenhasClient initialEntries={serialized} />
      </div>
    </PageContainer>
  );
}
