import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ComprasClient } from "./compras-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function ComprasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canCreate = ctx?.mode === "single";

  const [purchases, suppliers, ingredients] = await Promise.all([
    prisma.purchase.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { data: "desc" },
      take: 300,
      include: {
        supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        items: { include: { ingredient: { select: { id: true, name: true, unidade: true, precoAtual: true, quantidadeEmbalagem: true } } } },
        receiving: { select: { id: true, status: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.supplier.findMany({ where: { empresaId: { in: empresaIds }, active: true }, orderBy: { razaoSocial: "asc" } }),
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds }, active: true }, orderBy: { name: "asc" } }),
  ]);

  const serialized = purchases.map((p) => ({
    id: p.id,
    numeroNota: p.numeroNota,
    data: p.data.toISOString(),
    supplierId: p.supplierId,
    supplierName: p.supplier.nomeFantasia ?? p.supplier.razaoSocial,
    compradorResponsavel: p.compradorResponsavel,
    formaPagamento: p.formaPagamento,
    dataVencimento: p.dataVencimento ? p.dataVencimento.toISOString() : null,
    desconto: p.desconto,
    frete: p.frete,
    status: p.status,
    observacoes: p.observacoes,
    createdByName: p.createdBy.name,
    recebido: !!p.receiving,
    items: p.items.map((it) => ({
      id: it.id,
      ingredientId: it.ingredientId,
      ingredientName: it.ingredient.name,
      unidade: it.unidade,
      quantidade: it.quantidade,
      valorUnitario: it.valorUnitario,
      valorTotal: it.valorTotal,
      precoMedioAtual: it.ingredient.precoAtual,
    })),
    valorTotal: p.items.reduce((s, it) => s + it.valorTotal, 0) + p.frete - p.desconto,
  }));

  return (
    <PageContainer title="Estoque" subtitle="Compras">
      <div className="space-y-6">
        <ComprasClient
          initialPurchases={serialized}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.nomeFantasia ?? s.razaoSocial }))}
          ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unidade: i.unidade, unidadeCompra: i.unidadeCompra, precoAtual: i.precoAtual }))}
          canCreate={canCreate}
        />
      </div>
    </PageContainer>
  );
}
