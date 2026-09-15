import { PageContainer } from "@/components/page-container";
import { CmvRealClient } from "./cmv-real-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeCmvReal } from "@/lib/cmv-server";
import { listClosedMonths } from "@/lib/closed-period-filter";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

export default async function CmvRealPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "cmv", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const metaCmvPercent = ctx?.mode === "single" ? ctx.empresa.metaCmvPercent : 30;

  const mesFechado = listClosedMonths(1)[0];
  const result = await computeCmvReal(empresaIds, mesFechado.from, mesFechado.to);

  return (
    <PageContainer title="CMV" subtitle="CMV Real" backHref="/portal/cmv" backLabel="CMV">
      <div className="space-y-6">
        <CmvRealClient
          estoqueInicial={result.estoqueInicial}
          compras={result.compras}
          transferenciasRecebidas={result.transferenciasRecebidas}
          transferenciasEnviadas={result.transferenciasEnviadas}
          devolucoes={result.devolucoes}
          ajustes={result.ajustes}
          perdas={result.perdas}
          estoqueFinal={result.estoqueFinal}
          custoConsumido={result.custoConsumido}
          faturamentoDelivery={result.faturamentoDelivery}
          faturamentoSalao={result.faturamentoSalao}
          metaCmvPercent={metaCmvPercent}
          initialMode="mes"
          initialKey={mesFechado.key}
          initialLabel={mesFechado.label}
        />
      </div>
    </PageContainer>
  );
}
