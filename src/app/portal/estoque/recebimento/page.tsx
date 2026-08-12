import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EstoqueTabs } from "../estoque-tabs";
import { RecebimentoClient } from "./recebimento-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function RecebimentoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canCreate = ctx?.mode === "single";

  const [pendentes, recebimentos] = await Promise.all([
    prisma.purchase.findMany({
      where: { empresaId: { in: empresaIds }, status: { in: ["PEDIDO_REALIZADO", "AGUARDANDO_ENTREGA", "RECEBIDO_PARCIAL"] } },
      orderBy: { data: "desc" },
      include: {
        supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        items: { include: { ingredient: { select: { id: true, name: true, unidade: true } } } },
      },
    }),
    prisma.receiving.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { dataHora: "desc" },
      take: 100,
      include: {
        purchase: {
          include: {
            supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
            items: { include: { ingredient: { select: { id: true, name: true, unidade: true } } } },
          },
        },
      },
    }),
  ]);

  return (
    <PageContainer title="Estoque" subtitle="Recebimento de Mercadorias">
      <div className="space-y-6">
        <EstoqueTabs />
        <RecebimentoClient
          initialPendentes={pendentes.map((p) => ({
            id: p.id,
            numeroNota: p.numeroNota,
            data: p.data.toISOString(),
            supplierName: p.supplier.nomeFantasia ?? p.supplier.razaoSocial,
            items: p.items.map((it) => ({ id: it.id, ingredientId: it.ingredientId, ingredientName: it.ingredient.name, unidade: it.unidade, quantidade: it.quantidade })),
          }))}
          initialRecebimentos={recebimentos.map((r) => ({
            id: r.id,
            dataHora: r.dataHora.toISOString(),
            responsavel: r.responsavel,
            status: r.status,
            divergencias: r.divergencias,
            observacao: r.observacao,
            supplierName: r.purchase.supplier.nomeFantasia ?? r.purchase.supplier.razaoSocial,
            numeroNota: r.purchase.numeroNota,
          }))}
          canCreate={canCreate}
        />
      </div>
    </PageContainer>
  );
}
