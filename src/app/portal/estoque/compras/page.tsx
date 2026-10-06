import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ComprasClient } from "./compras-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { RECEBIMENTO_MANAGE_ROLES } from "@/lib/estoque";
import { redirect } from "next/navigation";
import { resolveRollingPeriod } from "@/lib/periods";

// Checagem de cargo (RECEBIMENTO_MANAGE_ROLES) — ver comentário completo em
// src/app/api/estoque/compras/route.ts (achado ALTO do Jonas, auditoria de 2026-10-01): a carga
// inicial desta página já traz preço de cada item direto do servidor, então precisa do mesmo
// gate da rota GET.
export default async function ComprasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    redirect("/portal/inicio");
  }
  if (!RECEBIMENTO_MANAGE_ROLES.includes(session.user.role)) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageEstoque = await hasModulePermission(session.user.id, "estoque", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageEstoque;

  // Carga inicial já filtrada pelo período default do filtro de página
  // ("mes-atual"), pra bater com o que o cliente mostra assim que abre a
  // tela — mesmo padrão de src/app/portal/marketing/redes-sociais/page.tsx e
  // .../marketing/parcerias/page.tsx. `take` sobe para 2000 (igual à rota GET
  // /api/estoque/compras quando `key` está presente): o teto de 300 só fazia
  // sentido pra "últimas compras sem filtro nenhum", que deixou de ser o
  // comportamento padrão da tela.
  const { from, to } = resolveRollingPeriod("mes-atual");

  const [purchases, suppliers, ingredients, pendentesEntrega] = await Promise.all([
    prisma.purchase.findMany({
      where: { empresaId: { in: empresaIds }, data: { gte: from, lte: to } },
      orderBy: { data: "desc" },
      take: 2000,
      include: {
        supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        items: { include: { ingredient: { select: { id: true, name: true, unidade: true, precoAtual: true, quantidadeEmbalagem: true } } } },
        receiving: { select: { id: true, status: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.supplier.findMany({ where: { empresaId: { in: empresaIds }, active: true }, orderBy: { razaoSocial: "asc" } }),
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds }, active: true }, orderBy: { name: "asc" } }),
    // Card "Aguardando entrega" — de propósito SEM o filtro de data acima: um pedido
    // pendente não deixa de ser pendente só porque foi feito num mês anterior ao
    // filtrado na tela (mesma lógica, sem filtro de data, da consulta "pendentes" de
    // GET /api/estoque/recebimento).
    prisma.purchase.count({
      where: { empresaId: { in: empresaIds }, status: { in: ["PEDIDO_REALIZADO", "AGUARDANDO_ENTREGA"] } },
    }),
  ]);

  const serialized = purchases.map((p) => ({
    id: p.id,
    numeroNota: p.numeroNota,
    data: p.data.toISOString(),
    previsaoEntrega: p.previsaoEntrega ? p.previsaoEntrega.toISOString() : null,
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
          initialPendentesEntrega={pendentesEntrega}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.nomeFantasia ?? s.razaoSocial }))}
          ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unidade: i.unidade, unidadeCompra: i.unidadeCompra, precoAtual: i.precoAtual }))}
          canCreate={canCreate}
        />
      </div>
    </PageContainer>
  );
}
