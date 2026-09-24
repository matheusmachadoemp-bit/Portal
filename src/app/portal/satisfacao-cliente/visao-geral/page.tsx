import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { VisaoGeralClient } from "./visao-geral-client";

/**
 * Dashboard "Visão Geral" de Satisfação do Cliente (Fase 4, seções 12-15) — página "hub" do
 * módulo: KPIs, evolução da nota geral, satisfação por área e motivos de avaliações negativas.
 * Só um shell de servidor: o gate de módulo abaixo evita expor a tela pra quem não tem canView
 * na subcategoria "crm:visao-geral" (mesmo gate que GET /api/satisfacao-cliente/dashboard já
 * aplica); os dados vêm 100% daquela rota, consumidos pelo client component abaixo — mesmo
 * padrão já usado por Perguntas/Mesas (Fase 2).
 *
 * Módulo do gate é "crm" (não "satisfacao-cliente") desde a migração de menu que aninhou esta
 * subcategoria dentro da categoria "crm" (`prisma/migrations/*_satisfacao_cliente_crm_menu`):
 * o link do menu lateral é montado como `/portal/${categoria.key}/${subcategoria.key}` e a
 * visibilidade do item (`buildVisibilityResolver`, @/lib/permissions) é resolvida a partir de
 * QUAL CATEGORIA A SUBCATEGORIA ESTÁ ANINHADA NO BANCO — teria ficado inconsistente (item
 * visível no menu por ter permissão de "crm", mas a página negando por checar
 * "satisfacao-cliente") se o gate abaixo continuasse noutro módulo. "Perguntas" e "QR Codes /
 * Mesas" continuam de verdade sob a categoria "Satisfação do Cliente" (perfil próprio,
 * inalterado) — só "Visão Geral" e "Avaliações" migraram de módulo de permissão junto com a
 * mudança de menu.
 */
export default async function SatisfacaoClienteVisaoGeralPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "crm", "canView", "visao-geral"))) {
    redirect("/portal/inicio");
  }

  return (
    <PageContainer title="Satisfação do Cliente" subtitle="Visão geral">
      <VisaoGeralClient />
    </PageContainer>
  );
}
