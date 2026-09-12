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
        />
      </div>
    </PageContainer>
  );
}
