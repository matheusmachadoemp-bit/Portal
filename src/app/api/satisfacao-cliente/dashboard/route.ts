import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { resolveCrmPeriod, type CrmPeriodKey } from "@/lib/crm";
import {
  computeDashboardKpis,
  computeEvolucaoNota,
  computeMotivosNegativos,
  computeSatisfacaoPorArea,
  resolveEmpresaConfigs,
  EVOLUCAO_GRANULARIDADE_VALUES,
  type EvolucaoGranularidade,
} from "@/lib/customer-survey-dashboard";

/**
 * Dashboard "Visão Geral" (seções 12-15) — KPIs, evolução da nota, satisfação por área e
 * motivos de avaliações negativas, todos escopados ao mesmo período (mesmo padrão de
 * `GET /api/crm/dashboard`: `key`/`from`/`to` resolvidos por `resolveCrmPeriod`, reaproveitado
 * em vez de reinventar o cálculo de janela de datas).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "visao-geral"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o dashboard de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const contextEmpresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);

  const empresaIdParam = searchParams.get("empresaId");
  if (empresaIdParam && !contextEmpresaIds.includes(empresaIdParam)) {
    return NextResponse.json({ error: "Loja inválida ou sem acesso." }, { status: 403 });
  }
  const empresaIds = empresaIdParam ? [empresaIdParam] : contextEmpresaIds;

  const key = (searchParams.get("key") ?? "mes") as CrmPeriodKey;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const { from: periodFrom, to: periodTo } = resolveCrmPeriod(key, { from, to });

  const granularidadeParam = searchParams.get("granularidade") as EvolucaoGranularidade | null;
  const granularidade: EvolucaoGranularidade =
    granularidadeParam && EVOLUCAO_GRANULARIDADE_VALUES.includes(granularidadeParam) ? granularidadeParam : "dia";

  const configs = await resolveEmpresaConfigs(empresaIds);

  const [kpis, evolucao, satisfacaoPorArea, motivosNegativos] = await Promise.all([
    computeDashboardKpis(empresaIds, periodFrom, periodTo),
    computeEvolucaoNota(empresaIds, periodFrom, periodTo, granularidade),
    computeSatisfacaoPorArea(empresaIds, periodFrom, periodTo, configs),
    computeMotivosNegativos(empresaIds, periodFrom, periodTo),
  ]);

  return NextResponse.json({ kpis, evolucao, satisfacaoPorArea, motivosNegativos });
}
