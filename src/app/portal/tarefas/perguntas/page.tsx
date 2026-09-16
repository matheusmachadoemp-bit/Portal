import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { PerguntasClient } from "./perguntas-client";

/**
 * Catálogo de perguntas do Fechamento do Dia — criar, editar e excluir/desativar, além de
 * escolher em quais cargos (Gerente/Chef de Salão/Chef de Cozinha) cada pergunta aparece.
 * Só um shell de servidor: o gate de módulo abaixo evita expor a tela pra quem não tem
 * canEdit na subcategoria "fechamento-dia:perguntas" (mesmo gate que GET/POST
 * /api/fechamento-dia/perguntas já aplicam); a lista, os cargos e as categorias vêm 100%
 * daquela rota, consumida pelo client component abaixo.
 *
 * Vive em /portal/tarefas/perguntas (subcategoria "Perguntas" movida para dentro da categoria
 * "Tarefas" no menu lateral) — só o caminho da tela mudou, o conteúdo é o mesmo de antes.
 */
export default async function TarefasPerguntasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "fechamento-dia", "canView", "perguntas"))) {
    redirect("/portal/inicio");
  }

  const canEdit = await hasModulePermission(session.user.id, "fechamento-dia", "canEdit", "perguntas");
  const canDelete = await hasModulePermission(session.user.id, "fechamento-dia", "canDelete", "perguntas");

  return (
    <PageContainer
      title="Perguntas"
      subtitle="Catálogo de perguntas do Fechamento do Dia"
      backHref="/portal/tarefas"
      backLabel="Tarefas"
    >
      <PerguntasClient canEdit={canEdit} canDelete={canDelete} />
    </PageContainer>
  );
}
