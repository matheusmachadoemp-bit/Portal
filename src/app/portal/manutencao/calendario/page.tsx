import { PageContainer } from "@/components/page-container";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function CalendarioPreventivoPage() {
  return (
    <PageContainer title="Manutenção" subtitle="Calendário preventivo" backHref="/portal/manutencao" backLabel="Manutenção">
      <ComingSoon
        icon="CalendarClock"
        title="Calendário preventivo"
        description="A programação de manutenções preventivas com recorrência automática chega em uma próxima etapa."
      />
    </PageContainer>
  );
}
