import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { formatNumber, formatPercent, growth, pct } from "@/lib/calc";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { SOCIAL_NETWORK_OPTIONS } from "@/lib/marketing";
import { DynamicIcon } from "@/components/dynamic-icon";

const NETWORK_ICON: Record<string, string> = {
  Instagram: "Instagram",
  Facebook: "Facebook",
  TikTok: "Music2",
  Google: "Search",
  WhatsApp: "MessageCircle",
  Site: "Globe",
  YouTube: "Youtube",
};

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

  const current = entries[0];
  const previous = entries[1];

  const totalInteracoes = current
    ? current.curtidas + current.comentarios + current.compartilhamentos + current.salvamentos
    : 0;
  const engajamento = current ? pct(totalInteracoes, current.alcance || current.seguidoresFim) : 0;
  const novosSeguidores = current ? current.seguidoresFim - current.seguidoresInicio : 0;

  const countsByNetwork = SOCIAL_NETWORK_OPTIONS.map((net) => ({
    network: net,
    posts: publishedByNetwork.filter((p) => p.socialNetwork === net),
  })).filter((n) => n.posts.length > 0);

  return (
    <PageContainer title="Marketing" subtitle="Redes sociais — desempenho consolidado">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Seguidores" value={formatNumber(current?.seguidoresFim ?? 0)} icon="Users" />
          <StatCard
            label="Novos seguidores (mês)"
            value={formatNumber(novosSeguidores)}
            icon="UserPlus"
            delta={previous ? growth(novosSeguidores, previous.seguidoresFim - previous.seguidoresInicio) : null}
          />
          <StatCard label="Alcance" value={formatNumber(current?.alcance ?? 0)} icon="Radar" />
          <StatCard label="Impressões" value={formatNumber(current?.impressoes ?? 0)} icon="Eye" />
          <StatCard label="Engajamento" value={formatPercent(engajamento)} icon="Heart" />
          <StatCard label="Compartilhamentos" value={formatNumber(current?.compartilhamentos ?? 0)} icon="Share2" />
        </div>

        <Section title="Interações do último período">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Curtidas" value={formatNumber(current?.curtidas ?? 0)} icon="Heart" color="#ef4444" />
            <StatCard label="Comentários" value={formatNumber(current?.comentarios ?? 0)} icon="MessageCircle" color="#3b82f6" />
            <StatCard label="Compartilhamentos" value={formatNumber(current?.compartilhamentos ?? 0)} icon="Share2" color="#22c55e" />
            <StatCard label="Salvamentos" value={formatNumber(current?.salvamentos ?? 0)} icon="Bookmark" color="#eab308" />
          </div>
          <p className="text-xs text-nord-gray mt-3">
            Dados agregados a partir dos lançamentos mensais em Tráfego Pago. Para métricas nativas em tempo real,
            conecte as contas via Meta Business Suite / TikTok Ads (integração externa, fora do escopo atual).
          </p>
        </Section>

        <Section title="Melhores conteúdos publicados por rede">
          {countsByNetwork.length === 0 ? (
            <p className="text-sm text-nord-gray">Nenhum conteúdo publicado com rede social definida ainda.</p>
          ) : (
            <div className="space-y-5">
              {countsByNetwork.map(({ network, posts }) => (
                <div key={network}>
                  <div className="flex items-center gap-2 mb-2">
                    <DynamicIcon name={NETWORK_ICON[network] ?? "Share2"} size={15} className="text-nord-blue-light" />
                    <h4 className="text-white text-sm font-medium">{network}</h4>
                    <Badge>{posts.length} publicados</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {posts.slice(0, 6).map((p) => (
                      <div key={p.id} className="nord-card p-3">
                        <p className="text-white text-sm truncate">{p.title}</p>
                        <p className="text-xs text-nord-gray">{p.format ?? "—"} · {p.category ?? "—"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </PageContainer>
  );
}
