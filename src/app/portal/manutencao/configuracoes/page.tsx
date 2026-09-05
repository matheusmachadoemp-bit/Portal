import { PageContainer } from "@/components/page-container";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function ConfiguracoesManutencaoPage() {
  return (
    <PageContainer title="Manutenção" subtitle="Configurações" backHref="/portal/manutencao" backLabel="Manutenção">
      <ComingSoon
        icon="Settings"
        title="Configurações"
        description="Limites de aprovação financeira e preferências de notificação chegam em uma próxima etapa."
      />
    </PageContainer>
  );
}
