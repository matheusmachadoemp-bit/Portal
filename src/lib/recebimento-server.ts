import { prisma } from "@/lib/prisma";

const RECEIVING_INCLUDE = {
  empresa: { select: { name: true, color: true } },
  supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
  responsavelRecebimento: { select: { id: true, name: true } },
  items: {
    include: {
      ingredient: {
        select: {
          id: true,
          name: true,
          unidade: true,
          estoqueAtual: true,
          exigirPeso: true,
          exigirValidade: true,
          exigirTemperatura: true,
          exigirFoto: true,
        },
      },
      receivingItem: true,
    },
  },
  receiving: { include: { items: true } },
} as const;

export async function loadPurchaseByToken(token: string) {
  return prisma.purchase.findUnique({
    where: { recebimentoToken: token },
    include: RECEIVING_INCLUDE,
  });
}

export type PurchaseByToken = NonNullable<Awaited<ReturnType<typeof loadPurchaseByToken>>>;

export function receivingState(purchase: PurchaseByToken | null) {
  if (!purchase) return "invalido" as const;
  if (purchase.status === "CANCELADO") return "cancelado" as const;
  if (purchase.status === "RECEBIDO" || purchase.status === "RECEBIDO_PARCIAL" || purchase.status === "DIVERGENCIA") {
    return "finalizado" as const;
  }
  return "ok" as const;
}

/** Registra um evento na linha do tempo do pedido (histórico auditável), reaproveitando o AuditLog genérico já usado em outros módulos. */
export async function logPurchaseEvent(params: {
  purchaseId: string;
  empresaId: string;
  action: string;
  userId?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      entityType: "Purchase",
      entityId: params.purchaseId,
      empresaId: params.empresaId,
      userId: params.userId ?? null,
      action: params.action,
    },
  });
}

/**
 * KPIs do dashboard gerencial de Recebimento: volume, % sem divergência, atrasos,
 * divergências em aberto, valor acumulado das divergências, tempo médio de resolução
 * e o fornecedor com mais problemas — tudo calculado a partir de Receiving/ReceivingItem
 * (nada é armazenado à parte; o dashboard é sempre um retrato atual dos dados já registrados).
 */
export async function loadRecebimentoDashboard(empresaIds: string[], since: Date, supplierId?: string) {
  const receivings = await prisma.receiving.findMany({
    where: {
      empresaId: { in: empresaIds },
      dataFim: { gte: since },
      ...(supplierId ? { purchase: { supplierId } } : {}),
    },
    include: {
      purchase: {
        select: {
          id: true,
          previsaoEntrega: true,
          supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        },
      },
      items: { include: { purchaseItem: { select: { quantidade: true, valorUnitario: true } } } },
    },
  });

  const totalRecebimentos = receivings.length;
  const semDivergencia = receivings.filter(
    (r) => !r.items.some((it) => it.status === "DIVERGENCIA" || it.status === "NAO_RECEBIDO")
  ).length;
  const pctSemDivergencia = totalRecebimentos ? (semDivergencia / totalRecebimentos) * 100 : 0;

  const pedidosAtrasados = receivings.filter(
    (r) => r.purchase.previsaoEntrega && r.dataFim && r.dataFim > r.purchase.previsaoEntrega
  ).length;

  const divergentes = receivings.flatMap((r) =>
    r.items
      .filter((it) => it.status === "DIVERGENCIA" || it.status === "NAO_RECEBIDO")
      .map((it) => ({ ...it, supplier: r.purchase.supplier }))
  );

  const divergenciasAbertas = divergentes.filter((it) => it.resolucaoTipo === "AGUARDANDO").length;

  const valorDivergencias = divergentes.reduce((sum, it) => {
    const precoRef = it.precoInformado ?? it.purchaseItem.valorUnitario;
    const qtdDif = (it.quantidadeRecebida ?? 0) - it.purchaseItem.quantidade;
    return sum + Math.abs(qtdDif) * precoRef;
  }, 0);

  const resolvidos = divergentes.filter((it) => it.resolvidoEm);
  const tempoMedioResolucaoDias = resolvidos.length
    ? resolvidos.reduce((sum, it) => sum + (it.resolvidoEm!.getTime() - it.createdAt.getTime()) / 86400000, 0) / resolvidos.length
    : null;

  const porFornecedor = new Map<string, { nome: string; count: number }>();
  for (const it of divergentes) {
    const nome = it.supplier.nomeFantasia ?? it.supplier.razaoSocial;
    const entry = porFornecedor.get(it.supplier.id) ?? { nome, count: 0 };
    entry.count += 1;
    porFornecedor.set(it.supplier.id, entry);
  }
  const fornecedorMaisProblemas = [...porFornecedor.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    totalRecebimentos,
    pctSemDivergencia,
    pedidosAtrasados,
    divergenciasAbertas,
    valorDivergencias,
    tempoMedioResolucaoDias,
    fornecedorMaisProblemas,
  };
}

/**
 * Histórico de recebimento de um fornecedor: taxa de conformidade, valor de divergências
 * acumulado e atraso médio — complementa a `avaliacao` manual do fornecedor com dados reais.
 */
export async function loadSupplierReceivingHistory(supplierId: string) {
  const receivings = await prisma.receiving.findMany({
    where: { purchase: { supplierId } },
    include: {
      purchase: { select: { previsaoEntrega: true } },
      items: { include: { purchaseItem: { select: { quantidade: true, valorUnitario: true } } } },
    },
  });

  const totalRecebimentos = receivings.length;
  const comDivergencia = receivings.filter((r) =>
    r.items.some((it) => it.status === "DIVERGENCIA" || it.status === "NAO_RECEBIDO")
  ).length;
  const taxaConformidade = totalRecebimentos ? ((totalRecebimentos - comDivergencia) / totalRecebimentos) * 100 : null;

  const valorDivergencias = receivings
    .flatMap((r) => r.items.filter((it) => it.status === "DIVERGENCIA" || it.status === "NAO_RECEBIDO"))
    .reduce((sum, it) => {
      const precoRef = it.precoInformado ?? it.purchaseItem.valorUnitario;
      const qtdDif = (it.quantidadeRecebida ?? 0) - it.purchaseItem.quantidade;
      return sum + Math.abs(qtdDif) * precoRef;
    }, 0);

  const atrasos = receivings.filter((r) => r.purchase.previsaoEntrega && r.dataFim && r.dataFim > r.purchase.previsaoEntrega).length;
  const taxaAtraso = totalRecebimentos ? (atrasos / totalRecebimentos) * 100 : null;

  return { totalRecebimentos, taxaConformidade, valorDivergencias, taxaAtraso };
}

/** ADMINISTRADOR/GESTOR (globais) + GERENTE com acesso a essa empresa — mesmo critério usado no escalonamento do Checklist. */
async function loadManagers(empresaId: string) {
  return prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { role: { in: ["ADMINISTRADOR", "GESTOR"] } },
        { role: "GERENTE", empresaAccess: { some: { empresaId } } },
      ],
    },
    select: { id: true },
  });
}

/**
 * Notifica gerente(s) da loja + quem criou o pedido (comprador responsável) quando um
 * recebimento é finalizado com divergência. Uma Notification por destinatário, sem duplicar.
 */
export async function notifyReceivingDivergence(purchase: {
  id: string;
  empresaId: string;
  createdById: string;
  supplier: { razaoSocial: string; nomeFantasia: string | null };
}, resumo: { totalItens: number; divergencias: number; impactoFinanceiro: number }) {
  const managers = await loadManagers(purchase.empresaId);
  const recipientIds = [...new Set([purchase.createdById, ...managers.map((m) => m.id)])];
  if (recipientIds.length === 0) return;

  const supplierName = purchase.supplier.nomeFantasia ?? purchase.supplier.razaoSocial;
  const numero = purchase.id.slice(-5).toUpperCase();
  const title = "Divergência no recebimento";
  const body = `Pedido #${numero} — ${supplierName}: ${resumo.divergencias} de ${resumo.totalItens} produto(s) com divergência. Impacto financeiro estimado: ${resumo.impactoFinanceiro >= 0 ? "+" : ""}${resumo.impactoFinanceiro.toFixed(2)}.`;

  await prisma.notification.createMany({
    data: recipientIds.map((userId) => ({
      userId,
      type: "RECEBIMENTO_DIVERGENCIA",
      title,
      body,
      priority: "ATENCAO",
      purchaseId: purchase.id,
    })),
  });
}
