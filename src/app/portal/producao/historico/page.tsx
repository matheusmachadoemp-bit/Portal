import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { HistoricoClient } from "./historico-client";

export default async function ProducaoHistoricoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  const ordens = await prisma.productionOrder.findMany({
    where: { empresaId: { in: empresaIds }, date: { gte: trintaDiasAtras }, status: "CONCLUIDO" },
    orderBy: { date: "desc" },
    include: {
      productionItem: { include: { category: { select: { id: true, name: true, color: true, icon: true } } } },
      responsavel: { select: { id: true, name: true } },
    },
  });

  const serialized = ordens.map((o) => ({
    ...o,
    date: o.date.toISOString(),
    prazo: o.prazo.toISOString(),
    horaInicio: o.horaInicio ? o.horaInicio.toISOString() : null,
    horaFim: o.horaFim ? o.horaFim.toISOString() : null,
    validade: o.validade ? o.validade.toISOString() : null,
    ajusteEm: o.ajusteEm ? o.ajusteEm.toISOString() : null,
  }));

  return (
    <PageContainer title="Produção" subtitle="Histórico" backHref="/portal/producao" backLabel="Produção">
      <HistoricoClient initialOrdens={serialized as never} />
    </PageContainer>
  );
}
