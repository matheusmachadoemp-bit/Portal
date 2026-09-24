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
 * "crm:avaliacoes" (mesmo gate que GET /api/satisfacao-cliente/avaliacoes já aplica); a lista em
 * si vem 100% daquela rota, consumida pelo client component abaixo — mesmo padrão já usado por
 * Perguntas/Mesas (Fase 2).
 *
 * Módulo do gate é "crm" (não "satisfacao-cliente") desde a migração de menu que aninhou esta
 * subcategoria dentro da categoria "crm" — ver comentário completo em
 * src/app/portal/satisfacao-cliente/visao-geral/page.tsx. "Perguntas" e "QR Codes / Mesas"
 * continuam sob o módulo "satisfacao-cliente" (perfil próprio, inalterado) — inclusive a rota
 * `GET /api/satisfacao-cliente/mesas` que o filtro "Mesa" abaixo consulta: ela segue gated em
 * "satisfacao-cliente:mesas-qrcode" (acoplamento pré-existente, já era assim antes desta
 * mudança de menu, fora do escopo corrigir aqui) — um perfil com "crm" mas sem
 * "satisfacao-cliente" abre esta tela normalmente, só o dropdown "Mesa" pode vir vazio.
 *
 * `garcons` (pra popular o filtro "Garçom") é buscado aqui, direto pelo mesmo helper que a
 * pesquisa pública usa (`getSelectableGarcons`, src/lib/customer-survey-server.ts) — mesmo
 * racional de `getSelectableTeamMembers` já usado por Tarefas/RH/Manutenção: só disponível no
 * modo loja única (o filtro de garçom não faz sentido consolidado entre lojas diferentes).
 */
export default async function SatisfacaoClienteAvaliacoesPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "crm", "canView", "avaliacoes"))) {
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
