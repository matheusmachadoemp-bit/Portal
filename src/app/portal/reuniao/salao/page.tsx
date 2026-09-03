import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { SalaoClient } from "./salao-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { currentPeriodo } from "@/lib/reuniao";
import { computeSalaoMetrics } from "@/lib/reuniao-server";

export default async function ReuniaoSalaoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const periodo = currentPeriodo();

  const meetings = await prisma.salaoMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const metrics =
    ctx?.mode === "single" ? await computeSalaoMetrics(ctx.empresa.id, periodo) : { npsPercent: null, faturamentoValor: 0, ticketMedioValor: null };

  const current = ctx?.mode === "single" ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;

  return (
    <PageContainer title="Reunião" subtitle="Reunião Salão">
      <SalaoClient
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
