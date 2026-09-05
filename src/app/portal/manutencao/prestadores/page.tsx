import { PageContainer } from "@/components/page-container";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function PrestadoresPage() {
  return (
    <PageContainer title="Manutenção" subtitle="Prestadores" backHref="/portal/manutencao" backLabel="Manutenção">
      <ComingSoon
        icon="Users"
        title="Prestadores"
        description="Cadastro de prestadores, orçamentos e fluxo de aprovação chegam em uma próxima etapa."
      />
    </PageContainer>
  );
}
