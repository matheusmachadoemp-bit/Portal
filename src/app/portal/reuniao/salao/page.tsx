import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { SalaoClient } from "./salao-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { currentPeriodo } from "@/lib/reuniao";
import { computeSalaoMetrics, computeMelhorVendedor, computeComentariosDestaque } from "@/lib/reuniao-server";

export default async function ReuniaoSalaoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const periodo = currentPeriodo();

  const meetings = await prisma.salaoMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } }, produtoMetas: true },
  });

  const isSingle = ctx?.mode === "single";
  const metrics = isSingle
    ? await computeSalaoMetrics(ctx.empresa.id, periodo)
    : { npsPercent: null, faturamentoValor: 0, ticketMedioValor: null };
  const melhorVendedor = isSingle ? await computeMelhorVendedor(ctx.empresa.id, periodo) : { nome: null, valor: null };
  const comentarios = isSingle ? await computeComentariosDestaque(ctx.empresa.id, periodo) : [];

  const current = isSingle ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;

  return (
    <PageContainer title="Reunião" subtitle="Reunião Salão">
      <SalaoClient
        initialMeetings={meetings.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() }))}
        initialCurrent={current ? { ...current, createdAt: current.createdAt.toISOString(), updatedAt: current.updatedAt.toISOString() } : null}
        initialMetrics={metrics}
        initialMelhorVendedor={melhorVendedor}
        initialComentarios={comentarios}
        periodo={periodo}
        canCreate={isSingle}
        empresaName={isSingle ? ctx.empresa.name : "Grupo Nord"}
      />
    </PageContainer>
  );
}
