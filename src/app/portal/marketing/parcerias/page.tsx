import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { PartnersClient } from "./partners-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { findPartnersWithTotals } from "@/lib/marketing-partners";
import { resolveRollingPeriod } from "@/lib/periods";

export default async function ParceriasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageMarketing = await hasModulePermission(session.user.id, "marketing", "canCreate");
  const canEdit = await hasModulePermission(session.user.id, "marketing", "canEdit");
  const canDelete = await hasModulePermission(session.user.id, "marketing", "canDelete");
  // Mesma separação de src/app/portal/marketing/ideias/page.tsx: "criar"
  // (novo parceiro, POST /api/marketing/partners) depende de loja única
  // selecionada (ambiguidade de empresaId no modo Grupo Nord). "Adicionar
  // lançamento" (POST .../partners/[id]/entries) usa a MESMA permissão
  // (canCreate) mas SEM a restrição de modo — o parceiro já tem empresaId
  // fixa, então não há ambiguidade (ver comentário no próprio POST de
  // entries). Editar/excluir (parceiro OU lançamento) são ações sobre um
  // registro já existente e usam suas PRÓPRIAS permissões (canEdit/
  // canDelete, checadas separadamente nas rotas PATCH/DELETE) — não uma
  // única flag emprestada de canCreate, que escondia a ação errada pra um
  // perfil customizado com canDelete=true/canCreate=false (achado do
  // Teulis na revisão desta correção).
  const canCreate = ctx?.mode === "single" && canManageMarketing;
  const canCreateEntry = canManageMarketing;

  // Carga inicial já filtrada pelo período default do filtro de página
  // ("mes-atual"), pra bater com o que o cliente mostra assim que abre a
  // tela — mesmo padrão de src/app/portal/marketing/redes-sociais/page.tsx.
  const partners = await findPartnersWithTotals(empresaIds, resolveRollingPeriod("mes-atual"));

  const serialized = partners.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }));

  return (
    <PageContainer title="Marketing" subtitle="Parcerias — ranking de influencers por retorno">
      <PartnersClient
        initialPartners={serialized}
        canCreate={canCreate}
        canCreateEntry={canCreateEntry}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </PageContainer>
  );
}
