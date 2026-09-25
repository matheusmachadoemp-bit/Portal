import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { PageContainer } from "@/components/page-container";
import { MesasClient } from "./mesas-client";

/**
 * QR Codes das mesas da pesquisa de Satisfação do Cliente — criar mesa, ver/baixar/imprimir o QR,
 * regenerar o token (invalida o QR físico já impresso) e ativar/desativar. Só um shell de
 * servidor: o gate de módulo abaixo evita expor esta tela de administração pra quem não tem
 * canView na subcategoria "satisfacao-cliente:mesas-qrcode" — mais estrito do que o gate do
 * `GET /api/satisfacao-cliente/mesas` que a lista abaixo consulta (essa rota também aceita
 * "crm:avaliacoes", pra atender o dropdown de filtro "Mesa" da tela de Avaliações, que só lê a
 * lista e não expõe nenhuma ação de administrar mesa — ver comentário do GET naquela rota); a
 * lista em si vem 100% daquela rota, consumida pelo client component abaixo.
 *
 * `backHref` aponta pra Visão Geral (Fase 4) — a página "hub" do módulo, que não existia quando
 * esta tela foi criada (Fase 2).
 */
export default async function SatisfacaoClienteMesasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "mesas-qrcode"))) {
    redirect("/portal/inicio");
  }

  const [canCreate, canEdit, ctx] = await Promise.all([
    hasModulePermission(session.user.id, "satisfacao-cliente", "canCreate", "mesas-qrcode"),
    hasModulePermission(session.user.id, "satisfacao-cliente", "canEdit", "mesas-qrcode"),
    getActiveEmpresaContext(),
  ]);

  return (
    <PageContainer
      title="Mesas e QR Codes"
      subtitle="Cadastro das mesas e QR Codes da pesquisa de satisfação do cliente"
      backHref="/portal/satisfacao-cliente/visao-geral"
      backLabel="Satisfação do Cliente"
    >
      <MesasClient canCreate={canCreate} canEdit={canEdit} isGrupoNordMode={ctx?.mode !== "single"} />
    </PageContainer>
  );
}
