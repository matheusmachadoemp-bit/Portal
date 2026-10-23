import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageContainer } from "@/components/page-container";
import { BugsMelhoriasClient } from "./bugs-melhorias-client";

/**
 * Central de Bugs e Melhorias — painel administrativo (Fase 3, última fase). Visível só para
 * quem tem o cargo (`Role`) ADMINISTRADOR — checado AQUI, no próprio server component, e não só
 * escondendo o item do menu lateral: é o que o pedido original exige ("não permitir acesso
 * direto ao módulo por URL ou API sem autorização"). As rotas de API consumidas por esta tela
 * (`/api/feedback/**`) já repetem a mesma checagem (`session.user.role === "ADMINISTRADOR"` +
 * `hasModulePermission(..., "bugs-melhorias", ...)`) de forma independente — como
 * `hasModulePermission` sempre libera quem é ADMINISTRADOR (ver `src/lib/authz.ts`), o gate
 * abaixo é suficiente para garantir que a tela nunca fica visível sem os dados também estarem
 * acessíveis.
 */
export default async function BugsMelhoriasPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRADOR") {
    redirect("/portal/inicio");
  }

  return (
    <PageContainer title="Bugs e Melhorias" subtitle="Painel administrativo de relatos do Portal Nord">
      <BugsMelhoriasClient />
    </PageContainer>
  );
}
