import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { HojeClient } from "./hoje-client";

export default async function ProducaoHojePage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [ordens, categorias, teamMembers] = await Promise.all([
    prisma.productionOrder.findMany({
      where: { empresaId: { in: empresaIds }, date: { gte: dayStart, lt: dayEnd } },
      orderBy: { prazo: "asc" },
      include: {
        productionItem: { include: { category: { select: { id: true, name: true, color: true, icon: true } } } },
        responsavel: { select: { id: true, name: true } },
        ajustePor: { select: { id: true, name: true } },
      },
    }),
    prisma.productionCategory.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

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
    <PageContainer title="Produção" subtitle="Produção de Hoje" backHref="/portal/producao" backLabel="Produção">
      <HojeClient initialOrdens={serialized as never} categorias={categorias} teamMembers={teamMembers} />
    </PageContainer>
  );
}
