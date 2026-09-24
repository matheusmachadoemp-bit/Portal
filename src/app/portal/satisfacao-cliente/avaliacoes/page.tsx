import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { getSelectableGarcons } from "@/lib/customer-survey-server";
import { PageContainer } from "@/components/page-container";
import { AvaliacoesClient } from "./avaliacoes-client";

/**
 * Lista de avaliações da pesquisa de Satisfação do Cliente (Fase 4, seção 11) — filtro topo
 * (Todas/Positivas/Neutras/Críticas/Resolvidas/Pendentes) + filtros adicionais, tabela paginada e
 * link "Ver" pro detalhe (`/portal/satisfacao-cliente/avaliacoes/[id]`). Só um shell de servidor:
 * o gate de módulo abaixo evita expor a tela pra quem não tem canView na subcategoria
 * "satisfacao-cliente:avaliacoes" (mesmo gate que GET /api/satisfacao-cliente/avaliacoes já
 * aplica); a lista em si vem 100% daquela rota, consumida pelo client component abaixo — mesmo
 * padrão já usado por Perguntas/Mesas (Fase 2).
 *
 * `garcons` (pra popular o filtro "Garçom") é buscado aqui, direto pelo mesmo helper que a
 * pesquisa pública usa (`getSelectableGarcons`, src/lib/customer-survey-server.ts) — mesmo
 * racional de `getSelectableTeamMembers` já usado por Tarefas/RH/Manutenção: só disponível no
 * modo loja única (o filtro de garçom não faz sentido consolidado entre lojas diferentes). O
 * filtro "Mesa" é buscado pelo client, direto em GET /api/satisfacao-cliente/mesas (mesma rota que
 * a tela de Mesas/QR Codes já usa), pela mesma razão.
 */
export default async function SatisfacaoClienteAvaliacoesPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "avaliacoes"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const isGrupoNordMode = ctx?.mode !== "single";
  const empresas = ctx ? (ctx.mode === "single" ? [ctx.empresa] : ctx.empresas) : [];
  const garcons = ctx?.mode === "single" ? await getSelectableGarcons(ctx.empresa.id) : [];

  return (
    <PageContainer
      title="Avaliações"
      subtitle="Avaliações da pesquisa de satisfação do cliente"
      backHref="/portal/satisfacao-cliente/visao-geral"
      backLabel="Satisfação do Cliente"
    >
      <AvaliacoesClient
        isGrupoNordMode={isGrupoNordMode}
        empresas={empresas.map((e) => ({ id: e.id, name: e.name, color: e.color }))}
        garcons={garcons}
      />
    </PageContainer>
  );
}
