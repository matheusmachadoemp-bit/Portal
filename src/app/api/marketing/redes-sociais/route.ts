import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";
import { SOCIAL_NETWORK_OPTIONS } from "@/lib/marketing";

/**
 * Resumo de Marketing > Redes Sociais (current/previous/countsByNetwork)
 * calculado dentro do período escolhido no filtro padrão do portal — mesmo
 * formato que `src/app/portal/marketing/redes-sociais/page.tsx` já monta na
 * carga inicial (sem período), só que aqui `current`/`previous` são a
 * MarketingEntry mais recente e a segunda mais recente **dentro do
 * período**, e `countsByNetwork` são os MarketingTask publicados
 * (status PUBLICADO/RESULTADOS) com `date` **dentro do período** — uma
 * tarefa publicada sem `date` preenchido não entra em nenhum período.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Marketing." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const key = (searchParams.get("key") ?? "mes-atual") as RollingPeriodKey;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const { from: periodFrom, to: periodTo } = resolveRollingPeriod(key, { from, to });

  const [entries, publishedByNetwork] = await Promise.all([
    prisma.marketingEntry.findMany({
      where: { empresaId: { in: empresaIds }, date: { gte: periodFrom, lte: periodTo } },
      orderBy: { date: "desc" },
      take: 2,
    }),
    prisma.marketingTask.findMany({
      where: {
        empresaId: { in: empresaIds },
        status: { in: ["PUBLICADO", "RESULTADOS"] },
        socialNetwork: { not: null },
        date: { gte: periodFrom, lte: periodTo },
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
  const current = toSummary(entries[0]) ?? null;
  const previous = toSummary(entries[1]) ?? null;

  const countsByNetwork = SOCIAL_NETWORK_OPTIONS.map((net) => ({
    network: net,
    posts: publishedByNetwork
      .filter((p) => p.socialNetwork === net)
      .map((p) => ({ id: p.id, title: p.title, format: p.format, category: p.category, socialNetwork: p.socialNetwork })),
  })).filter((n) => n.posts.length > 0);

  return NextResponse.json({ current, previous, countsByNetwork });
}
