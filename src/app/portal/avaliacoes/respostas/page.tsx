import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { PageContainer } from "@/components/page-container";
import { RespostasClient } from "./respostas-client";

/**
 * Avaliações > Respostas (Fase 1, só iFood) — lista paginada com status/resposta gerada/
 * publicada, com ação de revisar manualmente as avaliações que caíram em
 * `PRECISA_REVISAO_MANUAL` ou `ERRO` (ver `PATCH /api/avaliacoes/reviews/[id]`). Só um shell de
 * servidor: a lista em si vem de `GET /api/avaliacoes/reviews`, consumida pelo client component
 * abaixo — mesmo padrão já usado por outras telas administrativas simples do projeto (ex.
 * `src/app/portal/reservas/mesas-ambientes/`).
 */
export default async function AvaliacoesRespostasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "avaliacoes", "canView"))) {
    redirect("/portal/inicio");
  }

  const canEdit = await hasModulePermission(session.user.id, "avaliacoes", "canEdit");
  const ctx = await getActiveEmpresaContext();
  const isGrupoNordMode = ctx?.mode !== "single";
  const empresas = ctx ? (ctx.mode === "single" ? [ctx.empresa] : ctx.empresas) : [];

  return (
    <PageContainer title="Avaliações" subtitle="Respostas" backHref="/portal/avaliacoes" backLabel="Avaliações">
      <RespostasClient canEdit={canEdit} isGrupoNordMode={isGrupoNordMode} empresas={empresas.map((e) => ({ id: e.id, name: e.name }))} />
    </PageContainer>
  );
}
