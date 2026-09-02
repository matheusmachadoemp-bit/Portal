import { PageContainer } from "@/components/page-container";
import { Section } from "@/components/ui/stat-card";
import { ChannelMetricCard, type ChannelMetric } from "../channel-metric-card";
import { ChannelPageHeader } from "../channel-page-header";

const metrics: ChannelMetric[] = [
  { label: "Impressões totais", value: "131.261", change: -41.99, previous: "226.286", icon: "Eye", color: "#1464F4" },
  { label: "Alcance total", value: "22.846", change: -28.2, previous: "31.819", icon: "Radar", color: "#a855f7" },
  { label: "CTR — cliques no link", value: "0,48%", change: -0.75, previous: "0,48%", icon: "MousePointerClick", color: "#f59e0b" },
  { label: "CPC médio", value: "R$ 1,87", change: 17.6, previous: "R$ 1,59", inverse: true, icon: "DollarSign", color: "#ef4444" },
  { label: "Cliques no link — Facebook", value: "161", change: -51.8, previous: "334", icon: "Megaphone", color: "#3b82f6" },
  { label: "Cliques no link — Instagram", value: "470", change: -38.32, previous: "762", icon: "Camera", color: "#a855f7" },
  { label: "Total de cliques no link", value: "631", change: -42.43, previous: "1.096", icon: "MousePointerClick", color: "#1464F4" },
  { label: "Adições ao carrinho", value: "670", change: -26.37, previous: "910", icon: "ShoppingCart", color: "#22c55e" },
  { label: "Compras iniciadas", value: "314", change: -23.97, previous: "413", icon: "ShoppingBag", color: "#22c55e" },
  { label: "Compras no site", value: "251", change: -22.05, previous: "322", icon: "CheckCircle2", color: "#22c55e" },
  { label: "Custo por compra", value: "R$ 4,70", change: -13.15, previous: "R$ 5,41", inverse: true, icon: "Receipt", color: "#ef4444" },
  { label: "ROAS de compras no site", value: "18,5x", change: 11.81, previous: "16,55x", icon: "TrendingUp", color: "#22c55e" },
  { label: "Valor investido", value: "R$ 1.178,48", change: -32.3, previous: "R$ 1.740,66", icon: "Wallet", color: "#f59e0b" },
  { label: "Valor das conversões", value: "R$ 21.803,77", change: -24.3, previous: "R$ 28.802,08", icon: "DollarSign", color: "#22c55e" },
];

export default function MetaAdsPage() {
  return (
    <PageContainer title="Marketing" subtitle="Meta Ads — investimento, conversão e retorno">
      <div className="space-y-6">
        <ChannelPageHeader active="Meta Ads" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Visão geral do Meta Ads</h2>
            <p className="text-xs text-nord-gray">Comparação com o período anterior.</p>
          </div>
          <button className="btn-outline">Selecionar período</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <ChannelMetricCard key={metric.label} metric={metric} />
          ))}
        </div>
        <Section title="Leitura executiva">
          <p className="text-sm text-nord-gray leading-relaxed">
            O investimento caiu 32,3% e as compras recuaram 22,05%, mas o custo por compra melhorou 13,15% e o ROAS
            avançou para 18,5x. A campanha está mais eficiente, porém operando com menor volume.
          </p>
        </Section>
      </div>
    </PageContainer>
  );
}
