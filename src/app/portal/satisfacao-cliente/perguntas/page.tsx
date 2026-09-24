import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { PageContainer } from "@/components/page-container";
import { PerguntasClient } from "./perguntas-client";

/**
 * Catálogo de perguntas da pesquisa de Satisfação do Cliente — criar, editar, ativar/desativar
 * e reordenar as perguntas próprias da loja ativa, além de visualizar (só leitura) o catálogo
 * compartilhado entre todas as lojas e a pergunta fixa de nota geral. Só um shell de servidor: o
 * gate de módulo abaixo evita expor a tela pra quem não tem canView na subcategoria
 * "satisfacao-cliente:perguntas" (mesmo gate que GET /api/satisfacao-cliente/perguntas já
 * aplica); a lista em si vem 100% daquela rota, consumida pelo client component abaixo.
 *
 * `backHref` aponta pra Visão Geral (Fase 4) — a página "hub" do módulo, que não existia quando
 * esta tela foi criada (Fase 2).
 */
export default async function SatisfacaoClientePerguntasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "perguntas"))) {
    redirect("/portal/inicio");
  }

  const [canCreate, canEdit, ctx] = await Promise.all([
    hasModulePermission(session.user.id, "satisfacao-cliente", "canCreate", "perguntas"),
    hasModulePermission(session.user.id, "satisfacao-cliente", "canEdit", "perguntas"),
    getActiveEmpresaContext(),
  ]);

  return (
    <PageContainer
      title="Perguntas"
      subtitle="Perguntas da pesquisa de satisfação do cliente"
      backHref="/portal/satisfacao-cliente/visao-geral"
      backLabel="Satisfação do Cliente"
    >
      <PerguntasClient canCreate={canCreate} canEdit={canEdit} isGrupoNordMode={ctx?.mode !== "single"} />
    </PageContainer>
  );
}
