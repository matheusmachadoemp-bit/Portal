import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ItensVendidosClient } from "./itens-vendidos-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { productTotalCost } from "@/lib/ficha";
import { subDays } from "date-fns";

export default async function ItensVendidosPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const since = subDays(new Date(), 30);

  const [items, products] = await Promise.all([
    prisma.saleItem.findMany({
      where: { sale: { empresaId: { in: empresaIds }, dateTime: { gte: since } } },
      select: { productId: true, nome: true, quantidade: true, faturamento: true },
    }),
    prisma.product.findMany({
      where: { empresaId: { in: empresaIds } },
      include: { ingredients: { include: { ingredient: true } } },
    }),
  ]);

  const costByProduct = new Map(products.map((p) => [p.id, productTotalCost(p.ingredients)]));

  const byKey = new Map<string, { nome: string; quantidade: number; faturamento: number; custo: number }>();
  for (const item of items) {
    const key = item.productId ?? item.nome;
    const custoUnitario = item.productId ? (costByProduct.get(item.productId) ?? 0) : 0;
    const cur = byKey.get(key) ?? { nome: item.nome, quantidade: 0, faturamento: 0, custo: 0 };
    cur.quantidade += item.quantidade;
    cur.faturamento += item.faturamento;
    cur.custo += custoUnitario * item.quantidade;
    byKey.set(key, cur);
  }

  const rows = [...byKey.values()].map((r) => ({
    nome: r.nome,
    quantidade: r.quantidade,
    faturamento: r.faturamento,
    margem: r.faturamento - r.custo,
  }));

  return (
    <PageContainer title="Vendas" subtitle="Itens Vendidos — Curva ABC">
      <div className="space-y-6">
        <ItensVendidosClient rows={rows} />
      </div>
    </PageContainer>
  );
}
