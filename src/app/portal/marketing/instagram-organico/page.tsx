import { PageContainer } from "@/components/page-container";
import { Section } from "@/components/ui/stat-card";
import { ChannelMetricCard, type ChannelMetric } from "../channel-metric-card";
import { ChannelPageHeader } from "../channel-page-header";
import { InstagramProfileClicks } from "./profile-clicks";
import { BestPostingDays } from "./posting-days";

const profile: ChannelMetric[] = [
  { label: "Número de seguidores", value: "15.806", change: 0.33, previous: "15.754", icon: "Users", color: "#1464F4" },
  { label: "Variação de seguidores", value: "52", change: -20, previous: "65", icon: "UserPlus", color: "#3b82f6" },
  { label: "Alcance único diário", value: "72.564", change: -28.3, previous: "101.212", icon: "Radar", color: "#a855f7" },
  { label: "Visitas ao perfil", value: "2.775", change: 5.55, previous: "2.629", icon: "Eye", color: "#22c55e" },
  { label: "Cliques do perfil", value: "212", change: 161.73, previous: "81", icon: "MousePointerClick", color: "#f59e0b" },
];
const content: ChannelMetric[] = [
  { label: "Interações nas postagens", value: "1.223", change: 94.13, previous: "630", icon: "Heart", color: "#ef4444" },
  { label: "Alcance das postagens", value: "18.310", change: 25.22, previous: "14.622", icon: "Radar", color: "#a855f7" },
  { label: "Postagens do feed", value: "7", change: 16.67, previous: "6", icon: "Image", color: "#1464F4" },
  { label: "Comentários", value: "59", icon: "MessageCircle", color: "#3b82f6" },
  { label: "Alcance dos Reels", value: "18.310", change: 25.22, previous: "14.622", icon: "Clapperboard", color: "#a855f7" },
  { label: "Interações nos Reels", value: "1.223", change: 94.13, previous: "630", icon: "Heart", color: "#ef4444" },
  { label: "Número de Reels", value: "7", change: 16.67, previous: "6", icon: "Clapperboard", color: "#1464F4" },
  { label: "Visualizações dos Stories", value: "16.039", change: 8.92, previous: "14.725", icon: "CircleDot", color: "#f59e0b" },
  { label: "Retenção dos Stories", value: "82,99%", change: 1.06, previous: "82,12%", icon: "Timer", color: "#22c55e" },
  { label: "Número de Stories", value: "102", change: 3.03, previous: "99", icon: "CircleDot", color: "#f59e0b" },
];

export default function InstagramOrganicoPage() {
  return (
    <PageContainer title="Marketing" subtitle="Instagram Orgânico — perfil, conteúdo e audiência">
      <div className="space-y-6">
        <ChannelPageHeader active="Instagram Orgânico" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Desempenho do perfil</h2>
            <p className="text-xs text-nord-gray">Comparação com o período anterior.</p>
          </div>
          <button className="btn-outline">Selecionar período</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {profile.map((metric) => (
            <ChannelMetricCard key={metric.label} metric={metric} />
          ))}
        </div>
        <Section title="Conteúdo publicado">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            {content.map((metric) => (
              <ChannelMetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </Section>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <InstagramProfileClicks />
          <BestPostingDays />
        </div>
      </div>
    </PageContainer>
  );
}
