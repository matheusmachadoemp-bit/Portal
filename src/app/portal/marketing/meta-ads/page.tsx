import { PageContainer } from "@/components/page-container";
import { Section } from "@/components/ui/stat-card";
import { ChannelMetricCard, type ChannelMetric } from "../channel-metric-card";
import { ChannelPageHeader } from "../channel-page-header";

const metrics: ChannelMetric[] = [
  { label: "Impressões totais", value: "131.261", change: -41.99, previous: "226.286" },
  { label: "Alcance total", value: "22.846", change: -28.2, previous: "31.819" },
  { label: "CTR — cliques no link", value: "0,48%", change: -0.75, previous: "0,48%" },
  { label: "CPC médio", value: "R$ 1,87", change: 17.6, previous: "R$ 1,59", inverse: true },
  { label: "Cliques no link — Facebook", value: "161", change: -51.8, previous: "334" },
  { label: "Cliques no link — Instagram", value: "470", change: -38.32, previous: "762" },
  { label: "Total de cliques no link", value: "631", change: -42.43, previous: "1.096" },
  { label: "Adições ao carrinho", value: "670", change: -26.37, previous: "910" },
  { label: "Compras iniciadas", value: "314", change: -23.97, previous: "413" },
  { label: "Compras no site", value: "251", change: -22.05, previous: "322" },
  { label: "Custo por compra", value: "R$ 4,70", change: -13.15, previous: "R$ 5,41", inverse: true },
  { label: "ROAS de compras no site", value: "18,5x", change: 11.81, previous: "16,55x" },
  { label: "Valor investido", value: "R$ 1.178,48", change: -32.3, previous: "R$ 1.740,66" },
  { label: "Valor das conversões", value: "R$ 21.803,77", change: -24.3, previous: "R$ 28.802,08" },
];

export default function MetaAdsPage() {
  return <PageContainer title="Marketing" subtitle="Meta Ads — investimento, conversão e retorno"><div className="space-y-6">
    <ChannelPageHeader active="Meta Ads" />
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">Visão geral do Meta Ads</h2><p className="text-xs text-nord-gray">Comparação com o período anterior.</p></div><button className="btn-outline">Selecionar período</button></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{metrics.map((metric) => <ChannelMetricCard key={metric.label} metric={metric} />)}</div>
    <Section title="Leitura executiva"><p className="text-sm text-nord-gray leading-relaxed">O investimento caiu 32,3% e as compras recuaram 22,05%, mas o custo por compra melhorou 13,15% e o ROAS avançou para 18,5x. A campanha está mais eficiente, porém operando com menor volume.</p></Section>
  </div></PageContainer>;
}
