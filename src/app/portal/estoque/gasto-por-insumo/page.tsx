import { PageContainer } from "@/components/page-container";
import { GastoPorInsumoClient } from "./gasto-por-insumo-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeGastoPorInsumoRows } from "@/lib/recebimento-server";
import { resolveRollingPeriod } from "@/lib/periods";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

// Checagem de cargo (MANAGER_ROLES) — mesmo padrão já usado no Financeiro
// (src/app/portal/financeiro/dashboard/page.tsx) e no RH: sem ela, qualquer COLABORADOR com o
// Perfil de Permissão padrão "Funcionário" (estoque:canView=true de fábrica) conseguia ver quanto
// a empresa paga de verdade por cada insumo (achado ALTO do Jonas, auditoria de 2026-10-01).
// "Gasto por Insumo" é uma tela de relatório/análise pura — sem uso operacional (contagem,
// recebimento) que justifique acesso de um colaborador comum — por isso o bloqueio é da tela
// inteira, não só de um campo.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function GastoPorInsumoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    redirect("/portal/inicio");
  }
  if (!MANAGER_ROLES.includes(session.user.role)) {
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
