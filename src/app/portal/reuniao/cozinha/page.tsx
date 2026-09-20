import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CozinhaClient } from "./cozinha-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { currentPeriodo } from "@/lib/reuniao";
import { computeCozinhaMetrics, loadReuniaoCustomIndicators } from "@/lib/reuniao-server";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function ReuniaoCozinhaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reuniao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const periodo = currentPeriodo();
  // A prop "canCreate" desta tela na verdade controla o botão que salva o
  // fechamento da reunião de cozinha do período — um upsert (POST
  // /api/reuniao/cozinha), não uma criação de registro novo a cada clique.
  // A própria rota exige "canEdit" no módulo "reuniao" (não "canCreate"),
  // então checamos a permissão real que o backend usa, pra não "mentir" pro
  // usuário do jeito contrário (mostrar o botão achando que precisa de
  // canCreate quando na verdade precisa de canEdit).
  const canManageReuniao = await hasModulePermission(session.user.id, "reuniao", "canEdit");
  const canCreate = ctx?.mode === "single" && canManageReuniao;

  const meetings = await prisma.kitchenMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const metrics =
    ctx?.mode === "single" ? await computeCozinhaMetrics(ctx.empresa.id, periodo) : { cmvPercent: 0, desperdicioValor: 0, faturamento: 0 };

  const current = ctx?.mode === "single" ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;
  const customIndicators = ctx?.mode === "single" ? await loadReuniaoCustomIndicators(ctx.empresa.id, "COZINHA", periodo) : [];

  // Card "Metas de [próximo mês]": criar/editar já é coberto pelo mesmo critério de
  // `canCreate` (isSingle) que o resto da tela usa — mas excluir uma meta exige
  // especificamente `canDelete` no módulo "reuniao" (ver mesmo comentário em gerente/page.tsx).
  const canDeleteMetas = await hasModulePermission(session.user.id, "reuniao", "canDelete");

  return (
    <PageContainer title="Reunião" subtitle="Reunião Cozinha">
      <CozinhaClient
        initialMeetings={meetings.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() }))}
        initialCurrent={current ? { ...current, createdAt: current.createdAt.toISOString(), updatedAt: current.updatedAt.toISOString() } : null}
        initialMetrics={metrics}
        initialCustomIndicators={customIndicators}
        periodo={periodo}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
        canDeleteMetas={canDeleteMetas}
        empresaName={ctx?.mode === "single" ? ctx.empresa.name : "Grupo Nord"}
      />
    </PageContainer>
  );
}
