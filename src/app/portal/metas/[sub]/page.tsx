import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { MetasClient } from "./metas-client";
import { notFound } from "next/navigation";

const SUB_MAP: Record<string, { category: string; label: string }> = {
  gerencia: { category: "GERENCIA", label: "Metas da Gerência" },
  salao: { category: "SALAO", label: "Metas do Salão" },
  cozinha: { category: "COZINHA", label: "Metas da Cozinha" },
  delivery: { category: "DELIVERY", label: "Metas do Delivery" },
};

export default async function MetasSubPage({ params }: { params: Promise<{ sub: string }> }) {
  const { sub } = await params;
  const info = SUB_MAP[sub];
  if (!info) notFound();

  const goals = await prisma.goal.findMany({
    where: { category: info.category as never },
    orderBy: { endDate: "asc" },
    include: { attachments: true },
  });

  const serialized = goals.map((g) => ({
    ...g,
    startDate: g.startDate.toISOString(),
    endDate: g.endDate.toISOString(),
  }));

  return (
    <PageContainer title="Metas" subtitle={info.label}>
      <MetasClient initialGoals={serialized} category={info.category} />
    </PageContainer>
  );
}
