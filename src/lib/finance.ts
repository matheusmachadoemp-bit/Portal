import { prisma } from "@/lib/prisma";
import type { FinanceEntryStatus } from "@prisma/client";
import { round2 } from "@/lib/compra-itens";

export const PAID_STATUSES: FinanceEntryStatus[] = ["PAGO", "PARCIALMENTE_PAGO"];

/**
 * Divide um valor TOTAL em `n` parcelas iguais, em centavos, sem o ruído do ponto flutuante: as
 * `n - 1` primeiras parcelas recebem o mesmo valor (`round2(valor / n)`) e a ÚLTIMA absorve a
 * sobra do arredondamento, de forma que a SOMA das parcelas bata exatamente com `valor` — mesmo
 * cuidado já usado em `splitPayableByCategory` (`src/lib/compra-itens.ts`), que também concentra o
 * resto na última fatia em vez de espalhar 1 centavo perdido/sobrando em algum lugar impreciso.
 * Usado por `POST /api/financeiro/pagar` para gerar as parcelas de um lançamento parcelado.
 */
export function splitInstallments(valor: number, n: number): number[] {
  if (n <= 1) return [round2(valor)];
  const parcela = round2(valor / n);
  const parcelas = Array.from({ length: n - 1 }, () => parcela);
  parcelas.push(round2(valor - parcela * (n - 1)));
  return parcelas;
}

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
