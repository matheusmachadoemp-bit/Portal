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
