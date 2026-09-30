import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { PageContainer } from "@/components/page-container";
import { RoletaClient } from "./roleta-client";

/**
 * Catálogo de prêmios da Roleta (`RoulettePrize`) da loja ativa — criar, editar, ativar/desativar
 * e excluir os prêmios sorteados na pesquisa de satisfação do cliente. Só um shell de servidor: o
 * gate de módulo abaixo evita expor a tela pra quem não tem canView na subcategoria
 * "satisfacao-cliente:roleta" (mesmo gate que GET /api/satisfacao-cliente/roleta/premios já
 * aplica); a lista em si vem 100% daquela rota, consumida pelo client component abaixo.
 *
 * `backHref` aponta pra Visão Geral (hub do módulo) — mesmo padrão de Perguntas/Mesas.
 */
export default async function SatisfacaoClienteRoletaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "roleta"))) {
    redirect("/portal/inicio");
  }

  const [canCreate, canEdit, canDelete, ctx] = await Promise.all([
    hasModulePermission(session.user.id, "satisfacao-cliente", "canCreate", "roleta"),
    hasModulePermission(session.user.id, "satisfacao-cliente", "canEdit", "roleta"),
    hasModulePermission(session.user.id, "satisfacao-cliente", "canDelete", "roleta"),
    getActiveEmpresaContext(),
  ]);

  return (
    <PageContainer
      title="Roleta de Prêmios"
      subtitle="Catálogo de prêmios sorteados na pesquisa de satisfação do cliente"
      backHref="/portal/satisfacao-cliente/visao-geral"
      backLabel="Satisfação do Cliente"
    >
      <RoletaClient
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
