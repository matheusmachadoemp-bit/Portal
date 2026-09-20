import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { GerenteClient } from "./gerente-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { currentPeriodo } from "@/lib/reuniao";
import { computeGerenteMetrics, loadGerenteCustomIndicators } from "@/lib/reuniao-server";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function ReuniaoGerentePage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reuniao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const periodo = currentPeriodo();

  const meetings = await prisma.gerenteMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const isSingle = ctx?.mode === "single";
  const metrics = isSingle
    ? await computeGerenteMetrics(ctx.empresa.id, periodo)
    : { faturamentoTotalValor: null, cmvPercent: null, npsPercent: null, cancelamentoDeliveryPercent: null };
  const current = isSingle ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;
  const customIndicators = isSingle ? await loadGerenteCustomIndicators(ctx.empresa.id, periodo) : [];

  // A prop "canCreate" desta tela na verdade controla o botão que salva o
  // fechamento da reunião de gerente do período — um upsert (POST
  // /api/reuniao/gerente), não uma criação de registro novo a cada clique.
  // A própria rota exige "canEdit" no módulo "reuniao" (não "canCreate"),
  // então checamos a permissão real que o backend usa, pra não "mentir" pro
  // usuário do jeito contrário (mostrar o botão achando que precisa de
  // canCreate quando na verdade precisa de canEdit).
  const canManageReuniao = await hasModulePermission(session.user.id, "reuniao", "canEdit");
  const canCreate = isSingle && canManageReuniao;

  // Card "Metas de [próximo mês]": criar/editar já é coberto pelo mesmo critério de
  // `canCreate` (isSingle + canManageReuniao) que o resto da tela usa — mas excluir uma meta
  // exige especificamente `canDelete` no módulo "reuniao" (diferente de canCreate/canEdit, que
  // o perfil "gerente" já tem), então esse booleano vem calculado aqui pra esconder o botão de
  // excluir na tela em vez de deixar o usuário bater num 403 do servidor sem explicação.
  const canDeleteMetas = await hasModulePermission(session.user.id, "reuniao", "canDelete");

  return (
    <PageContainer title="Reunião" subtitle="Reunião Gerente">
      <GerenteClient
        initialMeetings={meetings.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() }))}
        initialCurrent={current ? { ...current, createdAt: current.createdAt.toISOString(), updatedAt: current.updatedAt.toISOString() } : null}
        initialMetrics={metrics}
        initialCustomIndicators={customIndicators}
        periodo={periodo}
        canCreate={canCreate}
        isGrupoNordMode={!isSingle}
        canDeleteMetas={canDeleteMetas}
        empresaName={isSingle ? ctx.empresa.name : "Grupo Nord"}
      />
    </PageContainer>
  );
}
