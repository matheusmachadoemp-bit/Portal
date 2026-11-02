import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { riskKeywordsForDisplay } from "@/lib/review-risk";
import { PageContainer } from "@/components/page-container";
import { ConfiguracoesClient } from "./configuracoes-client";

/**
 * Avaliações > Configurações (Fase 1, só iFood) — toggle de ativar/desativar a resposta
 * automática por loja (`Empresa.avaliacoesAutoReplyEnabled`, ver racional completo em
 * `prisma/schema.prisma`) + aviso sobre a palavra-chave de risco (2ª rede de segurança,
 * `src/lib/review-risk.ts`) + botão "Sincronizar agora" (mesma rota usada pelo cron diário).
 */
export default async function AvaliacoesConfiguracoesPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "avaliacoes", "canView"))) {
    redirect("/portal/inicio");
  }

  const canEdit = await hasModulePermission(session.user.id, "avaliacoes", "canEdit");
  const canExecute = await hasModulePermission(session.user.id, "avaliacoes", "canExecute");
  const empresa = await requireActiveSingleEmpresa();

  return (
    <PageContainer title="Avaliações" subtitle="Configurações" backHref="/portal/avaliacoes" backLabel="Avaliações">
      <ConfiguracoesClient
        hasEmpresa={!!empresa}
        avaliacoesAutoReplyEnabled={empresa?.avaliacoesAutoReplyEnabled ?? false}
        hasIfoodCredentials={!!(empresa?.ifoodClientId && empresa?.ifoodClientSecretCipher && empresa?.ifoodMerchantId)}
        canEdit={canEdit && !!empresa}
        canExecute={canExecute && !!empresa}
        riskKeywords={riskKeywordsForDisplay()}
      />
    </PageContainer>
  );
}
