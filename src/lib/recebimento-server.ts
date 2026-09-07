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
