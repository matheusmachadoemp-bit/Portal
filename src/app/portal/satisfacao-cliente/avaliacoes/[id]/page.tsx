import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { AvaliacaoDetailClient } from "./avaliacao-detail-client";

/**
 * Detalhe de uma avaliação — respostas, identificação do cliente e histórico de tratamento, com
 * os botões "Assumir atendimento" e "Registrar solução" da Fase 3. É a URL que o push de avaliação
 * crítica (`notifyCriticalResponse`, src/lib/customer-survey-server.ts) e o alerta da Tela de
 * Início já apontam (`/portal/satisfacao-cliente/avaliacoes/[id]`).
 *
 * Só um shell de servidor: o gate de módulo abaixo evita expor a tela pra quem não tem canView na
 * subcategoria "satisfacao-cliente:avaliacoes" (mesmo gate que GET
 * /api/satisfacao-cliente/avaliacoes/[id] já aplica); o detalhe em si vem 100% daquela rota,
 * consumido pelo client component abaixo. `canExecute` é resolvido aqui (server) e repassado como
 * prop — o mesmo flag que `POST .../assumir` e `POST .../resolver` já exigem — pra a tela não
 * mostrar os botões de ação clicáveis pra quem a API vai rejeitar de qualquer forma.
 */
export default async function SatisfacaoClienteAvaliacaoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "avaliacoes"))) {
    redirect("/portal/inicio");
  }
  const canExecute = await hasModulePermission(session.user.id, "satisfacao-cliente", "canExecute", "avaliacoes");

  return (
    <PageContainer
      title="Avaliações"
      subtitle="Detalhe da avaliação"
      backHref="/portal/satisfacao-cliente/avaliacoes"
      backLabel="Avaliações"
    >
      <AvaliacaoDetailClient
        id={id}
        currentUserId={session.user.id}
        currentUserRole={session.user.role}
        canExecute={canExecute}
      />
    </PageContainer>
  );
}
