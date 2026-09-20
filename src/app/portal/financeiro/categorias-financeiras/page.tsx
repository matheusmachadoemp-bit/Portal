import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { allDreCategories } from "@/lib/dre-structure";
import { CategoriasClient } from "./categorias-client";
import { getFinancialCategories } from "@/lib/financial-categories";

export default async function CategoriasFinanceirasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    redirect("/portal/inicio");
  }

  const categories = await getFinancialCategories();

  // FinancialCategory não tem empresaId (é um cadastro global, compartilhado
  // por todas as lojas) e as rotas /api/financeiro/categorias não exigem loja
  // ativa para criar/editar — igual a StockCategory em estoque/categorias,
  // não faz sentido travar por "ctx?.mode === 'single'" aqui: travaria uma
  // ação que a API aceitaria normalmente em modo Grupo Nord. Só a permissão
  // de verdade importa. Confirmado nas rotas: POST checa canCreate, PATCH
  // (edição de campos e ativar/desativar) checa canEdit.
  const canCreate = await hasModulePermission(session.user.id, "financeiro", "canCreate");
  const canEdit = await hasModulePermission(session.user.id, "financeiro", "canEdit");

  return (
    <PageContainer title="Financeiro" subtitle="Categorias Financeiras">
      <div className="space-y-6">
        <CategoriasClient
          initialCategories={categories}
          dreOptions={allDreCategories()}
          canCreate={canCreate}
          canEdit={canEdit}
        />
      </div>
    </PageContainer>
  );
}
