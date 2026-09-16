import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { LiderancaClient } from "./lideranca-client";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { currentPeriodo } from "@/lib/reuniao";
import { loadReuniaoCustomIndicators } from "@/lib/reuniao-server";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export default async function ReuniaoLiderancaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reuniao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const periodo = currentPeriodo();
  const isSingle = ctx?.mode === "single";

  // Esta página não precisa carregar o histórico de todos os períodos: só a linha do
  // período selecionado (usada apenas para saber se já existe um "fechamento" salvo e
  // permitir excluí-lo) — igual às outras 4 reuniões, "Resultado do período" (o antigo
  // resumo consolidado calculado via computeLiderancaResumo) saiu de tela, deixando só
  // "Fechamento do mês" (indicadores customizados) e "Metas de [próximo mês]".
  const current = isSingle
    ? await prisma.liderancaMeeting.findUnique({ where: { empresaId_periodo: { empresaId: ctx.empresa.id, periodo } } })
    : null;
  const customIndicators = isSingle ? await loadReuniaoCustomIndicators(ctx.empresa.id, "LIDERANCA", periodo) : [];

  // Card "Metas de [próximo mês]": criar/editar já é coberto pelo mesmo critério de
  // `canCreate` (isSingle) que o resto da tela usa — mas excluir uma meta exige
  // especificamente `canDelete` no módulo "reuniao" (ver mesmo comentário em gerente/page.tsx).
  const canDeleteMetas = await hasModulePermission(session.user.id, "reuniao", "canDelete");

  return (
    <PageContainer title="Reunião" subtitle="Reunião Liderança">
      <LiderancaClient
        initialCurrent={current ? { id: current.id, periodo: current.periodo } : null}
        initialCustomIndicators={customIndicators}
        periodo={periodo}
        canCreate={isSingle}
        canDeleteMetas={canDeleteMetas}
      />
    </PageContainer>
  );
}
