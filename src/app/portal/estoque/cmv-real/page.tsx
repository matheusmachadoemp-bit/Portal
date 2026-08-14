import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EstoqueTabs } from "../estoque-tabs";
import { CmvRealClient } from "./cmv-real-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { breakdownMovimentacoesNoPeriodo, cmvRealValor, valorEstoqueEm } from "@/lib/cmv";
import { subDays } from "date-fns";

const PERIOD_DAYS = 30;

export default async function CmvRealPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const now = new Date();
  const since = subDays(now, PERIOD_DAYS);
  const metaCmvPercent = ctx?.mode === "single" ? ctx.empresa.metaCmvPercent : 30;

  const [ingredients, movements, salesEntries] = await Promise.all([
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } } }),
    prisma.stockMovement.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { createdAt: "desc" } }),
    prisma.salesEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: since } } }),
  ]);

  const estoqueInicial = valorEstoqueEm(ingredients, movements, since);
  const estoqueFinal = valorEstoqueEm(ingredients, movements, now);
  const breakdown = breakdownMovimentacoesNoPeriodo(ingredients, movements, since, now);
  const compras = breakdown.compras;
  const custoConsumido = cmvRealValor(
    estoqueInicial + breakdown.transferenciasRecebidas,
    compras - breakdown.transferenciasEnviadas - breakdown.devolucoes + breakdown.ajustes,
    estoqueFinal
  );

  const faturamentoDelivery = salesEntries.reduce((s, e) => s + e.faturamentoDelivery, 0);
  const faturamentoSalao = salesEntries.reduce((s, e) => s + e.faturamentoSalao, 0);

  return (
    <PageContainer title="Estoque" subtitle="CMV Real">
      <div className="space-y-6">
        <EstoqueTabs />
        <CmvRealClient
          estoqueInicial={estoqueInicial}
          compras={compras}
          transferenciasRecebidas={breakdown.transferenciasRecebidas}
          transferenciasEnviadas={breakdown.transferenciasEnviadas}
          devolucoes={breakdown.devolucoes}
          ajustes={breakdown.ajustes}
          perdas={breakdown.perdas}
          estoqueFinal={estoqueFinal}
          custoConsumido={custoConsumido}
          faturamentoDelivery={faturamentoDelivery}
          faturamentoSalao={faturamentoSalao}
          metaCmvPercent={metaCmvPercent}
          periodDays={PERIOD_DAYS}
        />
      </div>
    </PageContainer>
  );
}
