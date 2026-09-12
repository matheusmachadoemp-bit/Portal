import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CozinhaClient } from "./cozinha-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { currentPeriodo } from "@/lib/reuniao";
import { computeCozinhaMetrics } from "@/lib/reuniao-server";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function ReuniaoCozinhaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reuniao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const periodo = currentPeriodo();

  const meetings = await prisma.kitchenMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const metrics =
    ctx?.mode === "single" ? await computeCozinhaMetrics(ctx.empresa.id, periodo) : { cmvPercent: 0, desperdicioValor: 0, faturamento: 0 };

  const current = ctx?.mode === "single" ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;

  return (
    <PageContainer title="Reunião" subtitle="Reunião Cozinha">
      <CozinhaClient
        initialMeetings={meetings.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() }))}
        initialCurrent={current ? { ...current, createdAt: current.createdAt.toISOString(), updatedAt: current.updatedAt.toISOString() } : null}
        initialMetrics={metrics}
        periodo={periodo}
        canCreate={ctx?.mode === "single"}
        empresaName={ctx?.mode === "single" ? ctx.empresa.name : "Grupo Nord"}
      />
    </PageContainer>
  );
}
