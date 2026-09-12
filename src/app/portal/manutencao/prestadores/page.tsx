import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { PrestadoresClient } from "./prestadores-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { MANAGER_ROLES } from "@/lib/manutencao-server";

export default async function PrestadoresPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "manutencao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const prestadores = await prisma.prestador.findMany({
    where: { OR: [{ empresaIds: { isEmpty: true } }, { empresaIds: { hasSome: empresaIds } }] },
    orderBy: { nome: "asc" },
    include: { _count: { select: { orcamentos: true, registros: true } } },
  });

  const valores = await prisma.manutencaoRegistro.groupBy({
    by: ["prestadorId"],
    where: { prestadorId: { in: prestadores.map((p) => p.id) } },
    _sum: { valorTotal: true },
  });
  const valorPorPrestador = new Map(valores.map((v) => [v.prestadorId, v._sum.valorTotal ?? 0]));

  const serialized = prestadores.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    valorTotalGasto: valorPorPrestador.get(p.id) ?? 0,
  }));

  return (
    <PageContainer title="Manutenção" subtitle="Prestadores" backHref="/portal/manutencao" backLabel="Manutenção">
      <PrestadoresClient
        initialPrestadores={serialized as never}
        canManage={!!session?.user && MANAGER_ROLES.includes(session.user.role)}
        empresas={(ctx?.mode === "single" ? [ctx.empresa] : ctx?.mode === "grupo" ? ctx.empresas : []).map((e) => ({
          id: e.id,
          name: e.name,
        }))}
      />
    </PageContainer>
  );
}
