import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { ProdutosClient } from "./produtos-client";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function ProducaoProdutosPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "producao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [itens, categorias, ingredientOptions] = await Promise.all([
    prisma.productionItem.findMany({
      where: { empresaId: { in: empresaIds }, active: true },
      orderBy: { name: "asc" },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        ingredientes: { include: { ingredient: { select: { id: true, name: true, unidade: true } } }, orderBy: { order: "asc" } },
        stock: true,
      },
    }),
    prisma.productionCategory.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } }, select: { id: true, name: true, unidade: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <PageContainer title="Produção" subtitle="Produtos de Produção" backHref="/portal/producao" backLabel="Produção">
      <ProdutosClient
        initialItens={itens as never}
        categorias={categorias}
        ingredientOptions={ingredientOptions}
        canCreate={ctx?.mode === "single"}
      />
    </PageContainer>
  );
}
