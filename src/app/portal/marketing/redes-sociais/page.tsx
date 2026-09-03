import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { SOCIAL_NETWORK_OPTIONS } from "@/lib/marketing";
import { RedesSociaisClient } from "./redes-sociais-client";

export default async function RedesSociaisPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [entries, publishedByNetwork] = await Promise.all([
    prisma.marketingEntry.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { date: "desc" },
      take: 2,
    }),
    prisma.marketingTask.findMany({
      where: {
        empresaId: { in: empresaIds },
        status: { in: ["PUBLICADO", "RESULTADOS"] },
        socialNetwork: { not: null },
      },
      orderBy: { date: "desc" },
      take: 40,
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
