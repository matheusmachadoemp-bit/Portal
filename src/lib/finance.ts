import { prisma } from "@/lib/prisma";
import type { FinanceEntryStatus } from "@prisma/client";

export const PAID_STATUSES: FinanceEntryStatus[] = ["PAGO", "PARCIALMENTE_PAGO"];

export async function adjustBankBalance(bankAccountId: string | null | undefined, delta: number) {
  if (!bankAccountId || !delta) return;
  await prisma.bankAccount.update({
    where: { id: bankAccountId },
    data: { saldoAtual: { increment: delta } },
  });
}

// direction: 1 para conta a receber (entrada), -1 para conta a pagar (saída)
export function balanceDelta(direction: 1 | -1, status: FinanceEntryStatus, valor: number) {
  if (!PAID_STATUSES.includes(status)) return 0;
  return direction * valor;
}
