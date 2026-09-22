import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { TrafegoPagoClient } from "./trafego-pago-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { defaultMetaAdsRange, loadActiveMetaAdsCampaigns, loadMetaAdsInsightSummary } from "@/lib/meta-ads-insights";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function TrafegoPagoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const range = defaultMetaAdsRange();
  const canManageMarketing = await hasModulePermission(session.user.id, "marketing", "canCreate");
  // "Novo período de marketing" (POST /api/marketing) precisa de loja única
  // selecionada — mesma ambiguidade de empresaId no modo Grupo Nord dos
  // demais módulos de Marketing (ver requireActiveSingleEmpresa na rota).
  // Editar/excluir um lançamento já existente usam suas PRÓPRIAS permissões
  // (canEdit/canDelete, checadas separadamente em PATCH/DELETE
  // /api/marketing/[id]) — não a mesma flag de canCreate, que escondia a
  // ação errada pra um perfil customizado com canDelete=true/canCreate=false
  // (mesmo achado do Teulis já corrigido em Ideias/Parcerias).
  const canCreate = ctx?.mode === "single" && canManageMarketing;
  const canEdit = await hasModulePermission(session.user.id, "marketing", "canEdit");
  const canDelete = await hasModulePermission(session.user.id, "marketing", "canDelete");

  const [entries, metaAdsSummary, metaAdsCampaigns] = await Promise.all([
    prisma.marketingEntry.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { date: "desc" },
      include: { createdBy: { select: { name: true } } },
    }),
    loadMetaAdsInsightSummary(empresaIds, range),
    loadActiveMetaAdsCampaigns(empresaIds, range),
  ]);

  const serialized = entries.map((e) => ({ ...e, date: e.date.toISOString() }));

  return (
    <PageContainer title="Marketing" subtitle="Tráfego pago — investimento, ROAS e conversões">
      <TrafegoPagoClient
        initialEntries={serialized}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        isGrupoNordMode={ctx?.mode !== "single"}
        metaAdsSummary={metaAdsSummary}
        metaAdsCampaigns={metaAdsCampaigns}
        metaAdsRange={{ start: range.start.toISOString(), end: range.end.toISOString() }}
      />
    </PageContainer>
  );
}
