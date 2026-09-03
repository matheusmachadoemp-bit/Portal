import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { GerenteClient } from "./gerente-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { currentPeriodo } from "@/lib/reuniao";
import { computeGerenteMetrics } from "@/lib/reuniao-server";

export default async function ReuniaoGerentePage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const periodo = currentPeriodo();

  const meetings = await prisma.gerenteMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const isSingle = ctx?.mode === "single";
  const metrics = isSingle
    ? await computeGerenteMetrics(ctx.empresa.id, periodo)
    : { faturamentoTotalValor: null, cmvPercent: null, npsPercent: null, cancelamentoDeliveryPercent: null };
  const current = isSingle ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;

  return (
    <PageContainer title="Reunião" subtitle="Reunião Gerente">
      <GerenteClient
        initialMeetings={meetings.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() }))}
        initialCurrent={current ? { ...current, createdAt: current.createdAt.toISOString(), updatedAt: current.updatedAt.toISOString() } : null}
        initialMetrics={metrics}
        periodo={periodo}
        canCreate={isSingle}
        empresaName={isSingle ? ctx.empresa.name : "Grupo Nord"}
      />
    </PageContainer>
  );
}
