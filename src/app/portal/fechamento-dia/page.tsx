import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { PageContainer } from "@/components/page-container";
import { StatusDoDiaClient } from "./status-client";

/**
 * "Status do Dia" — um card por cargo (Gerente/Chef de Salão/Chef de
 * Cozinha), com o status de hoje. Só um shell de servidor: o gate de módulo
 * abaixo evita expor a tela pra quem não tem acesso nenhum ao Fechamento do
 * Dia (mesmo gate que a rota GET /api/fechamento-dia/status já aplica como
 * primeira checagem); os cards em si — e a checagem fina por cargo
 * (podeVisualizar/podeExecutar) — vêm 100% daquela rota, consumida pelo
 * client component abaixo.
 */
export default async function FechamentoDiaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "fechamento-dia", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const subtitle = ctx?.mode === "single" ? ctx.empresa.name : "Grupo Nord (consolidado)";

  return (
    <PageContainer title="Fechamento do Dia" subtitle={subtitle}>
      <StatusDoDiaClient />
    </PageContainer>
  );
}
