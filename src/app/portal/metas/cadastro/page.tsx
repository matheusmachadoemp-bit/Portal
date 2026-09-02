import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { MetasCadastroClient } from "./metas-cadastro-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function MetasCadastroPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const goals = await prisma.goal.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { endDate: "asc" },
    include: { attachments: true },
  });

  const serialized = goals.map((g) => ({
    ...g,
    startDate: g.startDate.toISOString(),
    endDate: g.endDate.toISOString(),
  }));

  return (
    <PageContainer title="Metas" subtitle="Cadastrar metas — defina o setor, o valor e o prazo de cada meta." backHref="/portal/metas" backLabel="Visão geral de metas">
      <MetasCadastroClient initialGoals={serialized} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
