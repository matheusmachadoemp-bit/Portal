import { PageContainer } from "@/components/page-container";
import { CmvTeoricoClient } from "./cmv-teorico-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeCmvTeorico } from "@/lib/cmv-server";
import { listClosedMonths } from "@/lib/closed-period-filter";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

export default async function CmvTeoricoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "cmv", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const metaCmvPercent = ctx?.mode === "single" ? ctx.empresa.metaCmvPercent : 30;

  const mesFechado = listClosedMonths(1)[0];
  const result = await computeCmvTeorico(empresaIds, mesFechado.from, mesFechado.to, metaCmvPercent);

  return (
    <PageContainer title="CMV" subtitle="CMV Teórico" backHref="/portal/cmv" backLabel="CMV">
      <div className="space-y-6">
        <CmvTeoricoClient
          faturamentoPeriodo={result.faturamentoPeriodo}
          custoTeoricoTotal={result.custoTeoricoTotal}
          cmvTeoricoPercent={result.cmvTeoricoPercent}
          metaCmvPercent={metaCmvPercent}
          categoriaChart={result.categoriaChart}
          produtosMaiorImpacto={result.produtosMaiorImpacto}
          produtosSemFicha={result.produtosSemFicha}
          initialMode="mes"
          initialKey={mesFechado.key}
          initialLabel={mesFechado.label}
        />
      </div>
    </PageContainer>
  );
}
