import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { ComingSoon } from "@/components/ui/coming-soon";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function ConfiguracoesManutencaoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "manutencao", "canView"))) {
    redirect("/portal/inicio");
  }

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
