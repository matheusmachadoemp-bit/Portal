import { PageContainer } from "@/components/page-container";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function RelatoriosManutencaoPage() {
  return (
    <PageContainer title="Manutenção" subtitle="Relatórios" backHref="/portal/manutencao" backLabel="Manutenção">
      <ComingSoon
        icon="FileSpreadsheet"
        title="Relatórios"
        description="Relatórios completos com todos os indicadores e exportação em PDF chegam em uma próxima etapa."
      />
    </PageContainer>
  );
}
