import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { FluxoCaixaClient } from "./fluxo-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeFluxoCaixa } from "@/lib/fluxo-caixa-server";
import { resolveRollingPeriod } from "@/lib/periods";

export default async function FluxoDeCaixaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const range = resolveRollingPeriod("mes-atual");

  const serialized = await computeFluxoCaixa(empresaIds, range.from, range.to);

  return (
    <PageContainer title="Financeiro" subtitle="Fluxo de Caixa">
      <div className="space-y-6">
        <FluxoCaixaClient data={serialized} />
      </div>
    </PageContainer>
  );
}
