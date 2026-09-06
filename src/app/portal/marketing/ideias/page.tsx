import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { IdeasClient } from "./ideas-client";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { IDEA_APPROVER_ROLES } from "@/lib/marketing";

export default async function IdeiasPage() {
  const [session, ctx] = await Promise.all([auth(), getActiveEmpresaContext()]);
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const ideas = await prisma.marketingIdea.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } }, empresa: { select: { name: true } } },
  });

  const serialized = ideas.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }));

  return (
    <PageContainer title="Marketing" subtitle="Banco de ideias">
      <IdeasClient
        initialIdeas={serialized}
        canCreate={ctx?.mode === "single"}
        canApprove={IDEA_APPROVER_ROLES.includes(session?.user?.role ?? "")}
      />
    </PageContainer>
  );
}
