import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { SalaoClient } from "./salao-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { currentPeriodo } from "@/lib/reuniao";
import { computeComentariosDestaque, loadReuniaoCustomIndicators } from "@/lib/reuniao-server";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function ReuniaoSalaoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reuniao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const periodo = currentPeriodo();

  const meetings = await prisma.salaoMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } }, produtoMetas: true },
  });

  const isSingle = ctx?.mode === "single";
  // `computeMelhorVendedor` aqui no SSR ficava calculado (groupBy em WaiterSaleEntry +
  // findUnique em Employee) só pra alimentar a prop `initialMelhorVendedor` de
  // `<SalaoClient>` — que o client NUNCA desestruturava desde que a seção "Melhor vendedor
  // do mês" saiu da tela (commit aec6355f, "Remove seções mortas da Reunião Salão"); o
  // próprio salao-client.tsx já documentava isso em comentário. Removido daqui.
  // `computeMelhorVendedor` continua usada de verdade no POST de
  // src/app/api/reuniao/salao/route.ts (grava `melhorVendedorNome`/`melhorVendedorValor` no
  // upsert) e no GET da mesma rota, então a função em reuniao-server.ts não foi tocada.
  const comentarios = isSingle ? await computeComentariosDestaque(ctx.empresa.id, periodo) : [];

  const current = isSingle ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;
  const customIndicators = isSingle ? await loadReuniaoCustomIndicators(ctx.empresa.id, "SALAO", periodo) : [];

  // A prop "canCreate" desta tela na verdade controla o botão que salva o
  // fechamento da reunião de salão do período — um upsert (POST
  // /api/reuniao/salao), não uma criação de registro novo a cada clique.
  // A própria rota exige "canEdit" no módulo "reuniao" (não "canCreate"),
  // então checamos a permissão real que o backend usa, pra não "mentir" pro
  // usuário do jeito contrário (mostrar o botão achando que precisa de
  // canCreate quando na verdade precisa de canEdit).
  const canManageReuniao = await hasModulePermission(session.user.id, "reuniao", "canEdit");
  const canCreate = isSingle && canManageReuniao;

  // Card "Metas de [próximo mês]": criar/editar já é coberto pelo mesmo critério de
  // `canCreate` (isSingle + canManageReuniao) que o resto da tela usa — mas excluir uma meta
  // exige especificamente `canDelete` no módulo "reuniao" (ver mesmo comentário em
  // gerente/page.tsx).
  const canDeleteMetas = await hasModulePermission(session.user.id, "reuniao", "canDelete");

  return (
    <PageContainer title="Reunião" subtitle="Reunião Salão">
      <SalaoClient
        initialMeetings={meetings.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() }))}
        initialCurrent={current ? { ...current, createdAt: current.createdAt.toISOString(), updatedAt: current.updatedAt.toISOString() } : null}
        initialComentarios={comentarios}
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
