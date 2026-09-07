import { PageContainer } from "@/components/page-container";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function ProducaoIndicadoresPage() {
  return (
    <PageContainer title="Produção" subtitle="Indicadores" backHref="/portal/producao" backLabel="Produção">
      <ComingSoon
        icon="BarChart3"
        title="Em construção"
        description="Precisão da produção, excedente/desperdício estimado e os produtos com maior variação vão aparecer aqui assim que tivermos histórico suficiente de produção real acumulado."
      />
    </PageContainer>
  );
}
