import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ContagemClient } from "./contagem-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";

export default async function ContagemEstoquePage() {
  const ctx = await getActiveEmpresaContext();
  const session = await auth();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canCreate = ctx?.mode === "single";

  const [semanais, mensais] = await Promise.all([
    prisma.stockCount.findMany({
      where: { empresaId: { in: empresaIds }, type: "SEMANAL" },
      orderBy: { dataContagem: "desc" },
      take: 30,
      include: { items: true, createdBy: { select: { name: true } } },
    }),
    prisma.stockCount.findMany({
      where: { empresaId: { in: empresaIds }, type: "MENSAL" },
      orderBy: { dataContagem: "desc" },
      take: 24,
      include: { items: true, createdBy: { select: { name: true } } },
    }),
  ]);

  return (
    <PageContainer title="Estoque" subtitle="Contagem de Estoque">
      <div className="space-y-6">
        <ContagemClient
          initialSemanais={semanais.map((c) => ({
            id: c.id,
            setor: c.setor,
            semana: c.semana,
            ano: c.ano,
            dataContagem: c.dataContagem.toISOString(),
            responsavel: c.responsavel,
            horaInicio: c.horaInicio,
            horaFim: c.horaFim,
            status: c.status,
            totalItens: c.items.length,
            conferidos: c.items.filter((i) => i.quantidadeContada !== null).length,
            divergencias: c.items.filter((i) => i.status === "DIVERGENCIA").length,
            createdByName: c.createdBy.name,
          }))}
          initialMensais={mensais.map((c) => ({
            id: c.id,
            mes: c.mes,
            ano: c.ano,
            dataContagem: c.dataContagem.toISOString(),
            responsavel: c.responsavel,
            status: c.status,
            checklistJson: c.checklistJson,
            aprovadoPor: c.aprovadoPor,
            aprovadoEm: c.aprovadoEm ? c.aprovadoEm.toISOString() : null,
            totalItens: c.items.length,
            conferidos: c.items.filter((i) => i.quantidadeContada !== null).length,
            divergencias: c.items.filter((i) => i.status === "DIVERGENCIA").length,
            createdByName: c.createdBy.name,
          }))}
          canCreate={canCreate}
          userRole={session?.user?.role ?? ""}
        />
      </div>
    </PageContainer>
  );
}
