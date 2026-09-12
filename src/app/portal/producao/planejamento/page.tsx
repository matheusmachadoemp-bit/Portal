import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { PlanejamentoClient } from "./planejamento-client";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function ProducaoPlanejamentoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "producao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  amanha.setHours(0, 0, 0, 0);
  const depoisDeAmanha = new Date(amanha);
  depoisDeAmanha.setDate(depoisDeAmanha.getDate() + 1);

  const ordens = await prisma.productionOrder.findMany({
    where: { empresaId: { in: empresaIds }, date: { gte: amanha, lt: depoisDeAmanha } },
    orderBy: { prazo: "asc" },
    include: {
      productionItem: { include: { category: { select: { id: true, name: true, color: true, icon: true } } } },
      responsavel: { select: { id: true, name: true } },
      ajustePor: { select: { id: true, name: true } },
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
    <PageContainer title="Produção" subtitle="Planejamento de amanhã" backHref="/portal/producao" backLabel="Produção">
      <PlanejamentoClient initialOrdens={serialized as never} canManage={ctx?.mode === "single"} />
    </PageContainer>
  );
}
