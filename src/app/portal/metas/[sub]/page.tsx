import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { MetasClient } from "./metas-client";
import { redirect } from "next/navigation";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { GenericModulePage } from "@/components/generic-module/generic-module-page";

const SUB_MAP: Record<string, { category: string; label: string }> = {
  gerencia: { category: "GERENCIA", label: "Metas da Gerência" },
  salao: { category: "SALAO", label: "Metas do Salão" },
  cozinha: { category: "COZINHA", label: "Metas da Cozinha" },
  delivery: { category: "DELIVERY", label: "Metas do Delivery" },
  marketing: { category: "MARKETING", label: "Metas de Marketing" },
  administrativo: { category: "ADMINISTRATIVO", label: "Metas Administrativas" },
};

export default async function MetasSubPage({ params }: { params: Promise<{ sub: string }> }) {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "metas", "canView"))) {
    redirect("/portal/inicio");
  }

  const { sub } = await params;
  const info = SUB_MAP[sub];
  if (!info) {
    // `sub` não é uma aba hardcoded conhecida (SUB_MAP acima) — antes de desistir (notFound de
    // verdade), tenta achar uma Subcategory cadastrada no banco com essa key dentro da categoria
    // "metas" (criada pela sidebar, sem mapa próprio ainda) e cair no conteúdo genérico de
    // fallback. `GenericModulePage`/`loadGenericContent` já fazem essa busca e já chamam
    // `notFound()` de verdade se nem isso bater — ver @/lib/generic-content. O gate de permissão
    // de módulo acima desta linha já rodou, então esta chamada não abre nenhum acesso que a
    // função já não tivesse liberado.
    return <GenericModulePage categoryKey="metas" subcategoryKey={sub} />;
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const goals = await prisma.goal.findMany({
    where: { category: info.category as never, empresaId: { in: empresaIds } },
    orderBy: { endDate: "asc" },
    include: { attachments: true, weeklyUpdates: { orderBy: { weekNumber: "asc" } } },
  });

  const serialized = goals.map((g) => ({
    ...g,
    startDate: g.startDate.toISOString(),
    endDate: g.endDate.toISOString(),
    weeklyUpdates: g.weeklyUpdates.map((w) => ({
      id: w.id,
      weekNumber: w.weekNumber,
      valor: w.valor,
      observacao: w.observacao,
    })),
  }));

  return (
    <PageContainer title="Metas" subtitle={info.label} backHref="/portal/metas" backLabel="Visão geral de metas">
      <MetasClient initialGoals={serialized} category={info.category} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
