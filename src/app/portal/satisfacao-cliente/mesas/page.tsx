import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { PageContainer } from "@/components/page-container";
import { MesasClient } from "./mesas-client";

/**
 * QR Codes das mesas da pesquisa de Satisfação do Cliente — criar mesa, ver/baixar/imprimir o QR,
 * regenerar o token (invalida o QR físico já impresso) e ativar/desativar. Só um shell de
 * servidor: o gate de módulo abaixo evita expor a tela pra quem não tem canView na subcategoria
 * "satisfacao-cliente:mesas-qrcode" (mesmo gate que GET /api/satisfacao-cliente/mesas já aplica);
 * a lista em si vem 100% daquela rota, consumida pelo client component abaixo.
 *
 * Sem `backHref`: a categoria "Satisfação do Cliente" ainda não tem uma página "hub" (Visão
 * Geral, prevista para uma fase futura) nem entrada no menu lateral (chega numa tarefa backend
 * separada) — quando existir, aponte o botão de voltar pra ela.
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
    <PageContainer title="Mesas e QR Codes" subtitle="Cadastro das mesas e QR Codes da pesquisa de satisfação do cliente">
      <MesasClient canCreate={canCreate} canEdit={canEdit} isGrupoNordMode={ctx?.mode !== "single"} />
    </PageContainer>
  );
}
