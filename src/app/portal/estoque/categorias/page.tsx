import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CategoriasClient } from "./categorias-client";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

export default async function CategoriasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    redirect("/portal/inicio");
  }

  const categories = await prisma.stockCategory.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { ingredients: true } } },
  });

  // StockCategory não tem empresaId (é um cadastro global, compartilhado por
  // todas as lojas) e a API /api/estoque/categorias não exige loja específica
  // ativa para criar/editar — diferente das outras telas de Estoque, aqui não
  // faz sentido travar por "ctx?.mode === 'single'": travaria uma ação que a
  // API aceitaria normalmente em modo Grupo Nord. Só a permissão de verdade
  // importa. Confirmado nas rotas: POST checa canCreate, PATCH (edição de
  // campos e ativar/desativar) checa canEdit.
  const canCreate = await hasModulePermission(session.user.id, "estoque", "canCreate");
  const canEdit = await hasModulePermission(session.user.id, "estoque", "canEdit");

  return (
    <PageContainer title="Estoque" subtitle="Categorias">
      <div className="space-y-6">
        <CategoriasClient
          initialCategories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            color: c.color,
            icon: c.icon,
            setor: c.setor,
            metaPerdaPercent: c.metaPerdaPercent,
            periodicidadeContagem: c.periodicidadeContagem,
            active: c.active,
            produtos: c._count.ingredients,
          }))}
          canCreate={canCreate}
          canEdit={canEdit}
        />
      </div>
    </PageContainer>
  );
}
