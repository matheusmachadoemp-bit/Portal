import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { IdeasClient } from "./ideas-client";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { IDEA_APPROVER_ROLES } from "@/lib/marketing";

export default async function IdeiasPage() {
  const [session, ctx] = await Promise.all([auth(), getActiveEmpresaContext()]);
  if (!session?.user || !(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    redirect("/portal/inicio");
  }
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageMarketing = await hasModulePermission(session.user.id, "marketing", "canCreate");
  // "Criar" (nova ideia) precisa de loja única selecionada — não dá pra
  // saber em qual das lojas colocar um registro novo no modo Grupo Nord
  // consolidado (ver POST /api/marketing/ideas, que recusa create nesse
  // modo). Já as ações sobre um registro EXISTENTE (promover, excluir) não
  // têm essa ambiguidade — o registro já tem empresaId definida e só chega
  // no cliente se o usuário já tem acesso a essa loja (filtro por
  // empresaIdsForContext acima) — então não dependem do modo de
  // visualização. Mas cada uma tem sua PRÓPRIA permissão: promover edita a
  // ideia (PATCH /api/marketing/ideas/[id] exige `canEdit`) e excluir exige
  // `canDelete` (DELETE .../ideas/[id]) — checadas separadamente, não uma
  // única flag emprestada de `canCreate`. Antes as duas ficavam atrás da
  // mesma variável (derivada de `canCreate`), o que escondia a ação errada
  // pra um perfil customizado com `canDelete=true`/`canCreate=false` (ou
  // vice-versa) — achado do Teulis na revisão desta correção.
  const canCreate = ctx?.mode === "single" && canManageMarketing;
  const canEdit = await hasModulePermission(session.user.id, "marketing", "canEdit");
  const canDelete = await hasModulePermission(session.user.id, "marketing", "canDelete");

  const ideas = await prisma.marketingIdea.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } }, empresa: { select: { name: true } } },
  });

  const serialized = ideas.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }));

  return (
    <PageContainer title="Marketing" subtitle="Banco de ideias">
      <IdeasClient
        initialIdeas={serialized}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        canApprove={IDEA_APPROVER_ROLES.includes(session?.user?.role ?? "")}
      />
    </PageContainer>
  );
}
