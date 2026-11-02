import { auth } from "@/auth";
import { PageContainer } from "@/components/page-container";
import { AccessDenied } from "@/components/ui/access-denied";
import { NordAiPainelClient } from "./nord-ai-painel-client";

/**
 * Nord AI > Painel — tela de chat com o assistente (Fase 1, Etapa 2 deste módulo). A Etapa 1
 * (já em produção) só construiu o modelo de dados e as rotas de API
 * (`src/app/api/nord-ai/**`); sem esta pasta, o segmento dinâmico `[sub]` da categoria "nord-ai"
 * caía no fallback genérico de Arquivos (`GenericModulePage`) — ver
 * `src/app/portal/nord-ai/[sub]/page.tsx`, se existir.
 *
 * Acesso restrito a Role ADMINISTRADOR nesta fase — mesmo gate literal das rotas de API (ver
 * `requireNordAiAccess` em `src/app/api/nord-ai/conversations/route.ts`). Checado aqui, no
 * próprio server component, e não só escondendo o item do menu lateral — mesmo padrão de
 * `src/app/portal/administrativo/bugs-melhorias/page.tsx` e `src/app/portal/rh/ponto-eletronico/
 * page.tsx`: quem cair na URL direta sem ser Administrador vê um aviso amigável
 * (`AccessDenied`), não um erro cru ou uma tela em branco.
 */
export default async function NordAiPainelPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMINISTRADOR") {
    return (
      <PageContainer title="Nord AI" subtitle="Painel">
        <AccessDenied message="O Nord AI está disponível apenas para Administradores nesta fase. Se você precisa desse acesso, fale com um administrador do Portal." />
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Nord AI" subtitle="Converse com o assistente sobre os dados da sua loja">
      <NordAiPainelClient />
    </PageContainer>
  );
}
