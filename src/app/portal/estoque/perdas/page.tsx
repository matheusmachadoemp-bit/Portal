import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { PerdasClient } from "./perdas-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function PerdasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canCreate = ctx?.mode === "single";

  const [losses, ingredients] = await Promise.all([
    prisma.loss.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { data: "desc" },
      take: 300,
      include: { ingredient: { select: { id: true, name: true, unidade: true } }, createdBy: { select: { name: true } } },
    }),
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds }, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <PageContainer title="Estoque" subtitle="Perdas e Desperdícios">
      <div className="space-y-6">
        <PerdasClient
          initialLosses={losses.map((l) => ({
            id: l.id,
            data: l.data.toISOString(),
            setor: l.setor,
            ingredientName: l.ingredient.name,
            unidade: l.unidade,
            quantidade: l.quantidade,
            valorEstimado: l.valorEstimado,
            motivo: l.motivo,
            responsavel: l.responsavel,
            observacao: l.observacao,
          }))}
          ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unidade: i.unidade, setor: i.setor, precoAtual: i.precoAtual, quantidadeEmbalagem: i.quantidadeEmbalagem, estoqueAtual: i.estoqueAtual }))}
          canCreate={canCreate}
        />
      </div>
    </PageContainer>
  );
}
