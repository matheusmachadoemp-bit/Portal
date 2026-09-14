import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { LiderancaClient } from "./lideranca-client";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { currentPeriodo } from "@/lib/reuniao";
import { computeLiderancaResumo, loadReuniaoCustomIndicators, type LiderancaResumoDTO } from "@/lib/reuniao-server";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/** Resumo "zerado" usado no modo Grupo Nord (várias lojas ao mesmo tempo) — mesmo
 * padrão das outras 4 reuniões: o resumo consolidado só faz sentido loja a loja. */
const EMPTY_RESUMO: LiderancaResumoDTO = {
  faturamentoTotalValor: null,
  cmvPercent: null,
  npsPercent: null,
  cancelamentoDeliveryPercent: null,
  turnoverPercent: null,
  checklistOperacionalPercent: null,
  fontes: { gerente: false, salao: false, cozinha: false, delivery: false },
};

export default async function ReuniaoLiderancaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reuniao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const periodo = currentPeriodo();
  const isSingle = ctx?.mode === "single";

  // "Resultado do período" é 100% um resumo consolidado das outras 4 reuniões
  // (ver computeLiderancaResumo) — nunca digitado à mão, então (diferente das
  // outras 4 telas) esta página não precisa carregar o histórico de todos os
  // períodos: só a linha do período selecionado (usada apenas para saber se
  // já existe um "fechamento" salvo e permitir excluí-lo).
  const resumo = isSingle ? await computeLiderancaResumo(ctx.empresa.id, periodo) : EMPTY_RESUMO;
  const current = isSingle
    ? await prisma.liderancaMeeting.findUnique({ where: { empresaId_periodo: { empresaId: ctx.empresa.id, periodo } } })
    : null;
  const customIndicators = isSingle ? await loadReuniaoCustomIndicators(ctx.empresa.id, "LIDERANCA", periodo) : [];

  return (
    <PageContainer title="Reunião" subtitle="Reunião Liderança">
      <LiderancaClient
        initialCurrent={current ? { id: current.id, periodo: current.periodo } : null}
        initialResumo={resumo}
        initialCustomIndicators={customIndicators}
        periodo={periodo}
        canCreate={isSingle}
      />
    </PageContainer>
  );
}
