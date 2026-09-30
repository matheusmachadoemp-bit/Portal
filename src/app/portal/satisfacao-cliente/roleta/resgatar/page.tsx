import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { ResgatarClient } from "./resgatar-client";

/**
 * Resgate de prêmio da Roleta pelo código digitado — tela do dia a dia do funcionário no balcão
 * (garçom, caixa, gerente etc.), não um painel de administração. Só um shell de servidor: o gate
 * abaixo usa `canExecute` (não `canView`) na subcategoria "satisfacao-cliente:roleta" — o mesmo
 * flag que `POST /api/satisfacao-cliente/roleta/resgatar` exige (ver comentário daquela rota:
 * "ação operacional", não "edição de config" — por isso Funcionário/Líder têm acesso aqui mesmo
 * sem canCreate/canEdit/canDelete no catálogo administrativo de prêmios).
 *
 * `backHref` aponta pro catálogo administrativo de prêmios (`/roleta`), já que esta tela é uma
 * sub-rota dele — mesmo padrão de outras telas de detalhe/ação aninhadas sob uma lista (ex.:
 * `manutencao/equipamentos/[id]` -> `manutencao/equipamentos`).
 */
export default async function SatisfacaoClienteRoletaResgatarPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "satisfacao-cliente", "canExecute", "roleta"))) {
    redirect("/portal/inicio");
  }

  return (
    <PageContainer
      title="Roleta de Prêmios"
      subtitle="Resgatar prêmio pelo código"
      backHref="/portal/satisfacao-cliente/roleta"
      backLabel="Prêmios da Roleta"
    >
      <ResgatarClient />
    </PageContainer>
  );
}
