import { PageContainer } from "@/components/page-container";
import { GastoPorInsumoClient } from "./gasto-por-insumo-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeGastoPorInsumoRows } from "@/lib/recebimento-server";
import { resolveRollingPeriod } from "@/lib/periods";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

export default async function GastoPorInsumoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const range = resolveRollingPeriod("mes-atual");
  const rows = await computeGastoPorInsumoRows(empresaIds, range.from, range.to);

  return (
    <PageContainer title="Estoque" subtitle="Gasto por Insumo">
      <div className="space-y-6">
        <GastoPorInsumoClient rows={rows} />
      </div>
    </PageContainer>
  );
}
