import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { VisaoGeralClient } from "./visao-geral-client";

/**
 * Dashboard "Visão Geral" de Satisfação do Cliente (Fase 4, seções 12-15) — página "hub" do
 * módulo: KPIs, evolução da nota geral, satisfação por área e motivos de avaliações negativas.
 * Só um shell de servidor: o gate de módulo abaixo evita expor a tela pra quem não tem canView
 * na subcategoria "satisfacao-cliente:visao-geral" (mesmo gate que GET
 * /api/satisfacao-cliente/dashboard já aplica); os dados vêm 100% daquela rota, consumidos pelo
 * client component abaixo — mesmo padrão já usado por Perguntas/Mesas (Fase 2).
 */
export default async function SatisfacaoClienteVisaoGeralPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "visao-geral"))) {
    redirect("/portal/inicio");
  }

  return (
    <PageContainer title="Satisfação do Cliente" subtitle="Visão geral">
      <VisaoGeralClient />
    </PageContainer>
  );
}
