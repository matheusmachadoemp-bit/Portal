import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { MovimentacoesClient } from "./movimentacoes-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function MovimentacoesPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canCreate = ctx?.mode === "single";

  const [movements, ingredients] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { ingredient: { select: { id: true, name: true, unidade: true } }, createdBy: { select: { name: true } } },
    }),
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
  ]);

  const serializedMovements = movements.map((m) => ({
    id: m.id,
    ingredientId: m.ingredientId,
    ingredientName: m.ingredient.name,
    unidade: m.ingredient.unidade,
    type: m.type,
    quantidade: m.quantidade,
    estoqueApos: m.estoqueApos,
    motivo: m.motivo,
    createdByName: m.createdBy.name,
    createdAt: m.createdAt.toISOString(),
  }));

  const serializedIngredients = ingredients.map((i) => ({ id: i.id, name: i.name, unidade: i.unidade, estoqueAtual: i.estoqueAtual }));

  return (
    <PageContainer title="Estoque" subtitle="Movimentações">
      <div className="space-y-6">
        <MovimentacoesClient initialMovements={serializedMovements} ingredients={serializedIngredients} canCreate={canCreate} />
      </div>
    </PageContainer>
  );
}
