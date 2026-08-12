import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { LancamentosClient } from "./lancamentos-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function LancamentosPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canCreate = ctx?.mode === "single";

  const [sales, products, employees] = await Promise.all([
    prisma.sale.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { dateTime: "desc" },
      take: 100,
      include: { items: true, garcom: { select: { id: true, name: true } } },
    }),
    prisma.product.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { empresaId: { in: empresaIds }, status: "ATIVO" }, orderBy: { name: "asc" } }),
  ]);

  const serializedSales = sales.map((s) => ({
    id: s.id,
    dateTime: s.dateTime.toISOString(),
    channel: s.channel,
    formaPagamento: s.formaPagamento,
    garcomId: s.garcomId,
    garcomName: s.garcom?.name ?? null,
    mesaNumero: s.mesaNumero,
    bairro: s.bairro,
    regiao: s.regiao,
    valorTotal: s.valorTotal,
    items: s.items.map((i) => ({ id: i.id, nome: i.nome, quantidade: i.quantidade, precoUnitario: i.precoUnitario, faturamento: i.faturamento })),
  }));

  return (
    <PageContainer title="Vendas" subtitle="Lançamentos">
      <div className="space-y-6">
        <LancamentosClient
          initialSales={serializedSales}
          products={products.map((p) => ({ id: p.id, name: p.name, category: p.category, precoVenda: p.precoVenda }))}
          employees={employees.map((e) => ({ id: e.id, name: e.name }))}
          canCreate={canCreate}
        />
      </div>
    </PageContainer>
  );
}
