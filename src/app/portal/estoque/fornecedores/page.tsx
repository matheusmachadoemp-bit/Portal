import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { FornecedoresClient } from "./fornecedores-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function FornecedoresPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canCreate = ctx?.mode === "single";

  const suppliers = await prisma.supplier.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { razaoSocial: "asc" },
    include: {
      _count: { select: { ingredients: true, purchases: true } },
      purchases: { orderBy: { data: "desc" }, take: 1, select: { data: true } },
    },
  });

  return (
    <PageContainer title="Estoque" subtitle="Fornecedores">
      <div className="space-y-6">
        <FornecedoresClient
          initialSuppliers={suppliers.map((s) => ({
            id: s.id,
            razaoSocial: s.razaoSocial,
            nomeFantasia: s.nomeFantasia,
            cnpj: s.cnpj,
            telefone: s.telefone,
            whatsapp: s.whatsapp,
            email: s.email,
            endereco: s.endereco,
            prazoPagamentoDias: s.prazoPagamentoDias,
            prazoEntregaDias: s.prazoEntregaDias,
            pedidoMinimo: s.pedidoMinimo,
            avaliacao: s.avaliacao,
            active: s.active,
            observacao: s.observacao,
            produtos: s._count.ingredients,
            compras: s._count.purchases,
            ultimaCompra: s.purchases[0]?.data.toISOString() ?? null,
          }))}
          canCreate={canCreate}
        />
      </div>
    </PageContainer>
  );
}
