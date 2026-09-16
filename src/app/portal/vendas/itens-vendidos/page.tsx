import { PageContainer } from "@/components/page-container";
import { ItensVendidosClient } from "./itens-vendidos-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeItensVendidosRows } from "@/lib/faturamento-analytics";
import { resolveRollingPeriod } from "@/lib/periods";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

export default async function ItensVendidosPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "vendas", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const range = resolveRollingPeriod("mes-atual");
  const canManageVendas = await hasModulePermission(session.user.id, "vendas", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageVendas;

  const rows = await computeItensVendidosRows(empresaIds, range.from, range.to);

  return (
    <PageContainer title="Vendas" subtitle="Itens Vendidos — Curva ABC">
      <div className="space-y-6">
        <ItensVendidosClient rows={rows} canCreate={canCreate} />
      </div>
    </PageContainer>
  );
}
