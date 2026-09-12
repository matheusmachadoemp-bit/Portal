import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";
import { loadGarcomRanking } from "@/lib/garcons";
import { resolveRollingPeriod } from "@/lib/periods";
import { GarconsClient } from "./garcons-client";

export default async function GarconsDesempenhoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "vendas", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const range = resolveRollingPeriod("mes-atual");

  const ranking = await loadGarcomRanking(empresaIds, range.from, range.to);

  return (
    <PageContainer title="Vendas" subtitle="Desempenho por Garçom">
      <GarconsClient initialRanking={ranking} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
