import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { DivergenciasClient } from "./divergencias-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function DivergenciasRecebimentoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const items = await prisma.receivingItem.findMany({
    where: {
      status: { in: ["DIVERGENCIA", "NAO_RECEBIDO"] },
      receiving: { empresaId: { in: empresaIds } },
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
    include: {
      resolvidoPor: { select: { name: true } },
      receiving: {
        select: {
          id: true,
          dataFim: true,
          purchase: {
            select: {
              id: true,
              data: true,
              supplier: { select: { razaoSocial: true, nomeFantasia: true } },
            },
          },
        },
      },
      purchaseItem: {
        select: {
          quantidade: true,
          unidade: true,
          valorUnitario: true,
          ingredient: { select: { name: true } },
        },
      },
    },
  });

  return (
    <PageContainer title="Estoque" subtitle="Divergências de Recebimento">
      <DivergenciasClient
        initialItems={items.map((it) => ({
          id: it.id,
          status: it.status,
          quantidadeRecebida: it.quantidadeRecebida,
          precoInformado: it.precoInformado,
          fotoUrl: it.fotoUrl,
          divergenciaTipos: it.divergenciaTipos,
          divergenciaDescricao: it.divergenciaDescricao,
          resolucaoTipo: it.resolucaoTipo,
          resolucaoDataPrevista: it.resolucaoDataPrevista ? it.resolucaoDataPrevista.toISOString() : null,
          resolucaoValorCredito: it.resolucaoValorCredito,
          resolucaoObservacao: it.resolucaoObservacao,
          resolvidoPorNome: it.resolvidoPor?.name ?? null,
          resolvidoEm: it.resolvidoEm ? it.resolvidoEm.toISOString() : null,
          purchaseId: it.receiving.purchase.id,
          data: it.receiving.purchase.data.toISOString(),
          supplierName: it.receiving.purchase.supplier.nomeFantasia ?? it.receiving.purchase.supplier.razaoSocial,
          ingredientName: it.purchaseItem.ingredient.name,
          quantidadePedida: it.purchaseItem.quantidade,
          unidade: it.purchaseItem.unidade,
          valorUnitario: it.purchaseItem.valorUnitario,
        }))}
      />
    </PageContainer>
  );
}
