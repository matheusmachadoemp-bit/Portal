import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { SOCIAL_NETWORK_OPTIONS } from "@/lib/marketing";
import { resolveRollingPeriod } from "@/lib/periods";
import { RedesSociaisClient } from "./redes-sociais-client";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function RedesSociaisPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  // Carga inicial já filtrada pelo período default do filtro de página
  // ("mes-atual"), pra bater com o que o cliente mostra assim que abre a
  // tela — o mesmo período que a rota GET /api/marketing/redes-sociais usa
  // quando nenhum filtro foi aplicado ainda.
  const { from, to } = resolveRollingPeriod("mes-atual");

  const [entries, publishedByNetwork] = await Promise.all([
    prisma.marketingEntry.findMany({
      where: { empresaId: { in: empresaIds }, date: { gte: from, lte: to } },
      orderBy: { date: "desc" },
      take: 2,
    }),
    prisma.marketingTask.findMany({
      where: {
        empresaId: { in: empresaIds },
        status: { in: ["PUBLICADO", "RESULTADOS"] },
        socialNetwork: { not: null },
        date: { gte: from, lte: to },
      },
      orderBy: { date: "desc" },
    }),
  ]);

  const toSummary = (e: (typeof entries)[number] | undefined) =>
    e
      ? {
          seguidoresInicio: e.seguidoresInicio,
          seguidoresFim: e.seguidoresFim,
          alcance: e.alcance,
          impressoes: e.impressoes,
          curtidas: e.curtidas,
          comentarios: e.comentarios,
          compartilhamentos: e.compartilhamentos,
          salvamentos: e.salvamentos,
        }
      : undefined;
  const current = toSummary(entries[0]);
  const previous = toSummary(entries[1]);

  const countsByNetwork = SOCIAL_NETWORK_OPTIONS.map((net) => ({
    network: net,
    posts: publishedByNetwork
      .filter((p) => p.socialNetwork === net)
      .map((p) => ({ id: p.id, title: p.title, format: p.format, category: p.category, socialNetwork: p.socialNetwork })),
  })).filter((n) => n.posts.length > 0);

  return (
    <PageContainer title="Marketing" subtitle="Redes sociais — desempenho consolidado">
      <RedesSociaisClient
        current={current}
        previous={previous}
        countsByNetwork={countsByNetwork}
        instagramUsername={ctx?.mode === "single" ? ctx.empresa.metaAdsInstagramUsername ?? null : null}
      />
    </PageContainer>
  );
}
