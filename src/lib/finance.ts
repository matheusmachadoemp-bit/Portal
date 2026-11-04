import type { FinanceEntryStatus } from "@prisma/client";
import { round2 } from "@/lib/compra-itens";

export const PAID_STATUSES: FinanceEntryStatus[] = ["PAGO", "PARCIALMENTE_PAGO"];

/**
 * Formas de recebimento válidas para "receber de um cliente" (Contas a Receber) — mesmo espírito de
 * `PURCHASE_PAYMENT_METHODS` (`@/lib/estoque`, "a empresa pagando um fornecedor"), mas na direção
 * oposta: aqui é a empresa RECEBENDO de um cliente, então Boleto/Pago Online/Fiado fazem sentido
 * (contas antigas do Saipos recorrentemente usavam essas formas — ver `PAYMENT_METHOD_LABEL` em
 * `@/lib/vendas-analytics`) e por isso entram aqui, diferente de `PURCHASE_PAYMENT_METHODS`.
 * MUMBUCA também entra (moeda social/digital real aceita por uma das lojas, nas duas direções).
 *
 * Achado, 2026-11: a lista local de `contas-receber-client.tsx` (9 opções) nunca foi atualizada
 * quando `BOLETO`, `PAGO_ONLINE`, `FIADO` e `MUMBUCA` foram adicionados ao enum `PaymentMethod` —
 * ficavam indisponíveis no `<select>` de Contas a Receber mesmo já existindo no banco (um
 * lançamento recebido por boleto, por exemplo, não tinha como ser registrado corretamente).
 *
 * VOUCHER fica de fora de propósito: é uma forma de pagamento do CLIENTE direto na venda
 * (POS/Saipos/iFood — ver `SALE_PAYMENT_METHODS` em `@/lib/vendas-analytics`), sem uso observado em
 * `Receivable` (que cobre recebimentos mais genéricos, não só venda de balcão/delivery).
 * TED/DOC/TRANSFERENCIA/CHEQUE continuam (nunca saíram daqui, diferente de `PURCHASE_PAYMENT_METHODS`):
 * fazem sentido para um cliente pagar uma conta a receber via transferência bancária/cheque.
 */
export const RECEIVABLE_PAYMENT_METHODS = [
  "PIX",
  "DINHEIRO",
  "CARTAO_DEBITO",
  "CARTAO_CREDITO",
  "BOLETO",
  "PAGO_ONLINE",
  "FIADO",
  "MUMBUCA",
  "TED",
  "DOC",
  "TRANSFERENCIA",
  "CHEQUE",
  "OUTRO",
] as const;

/**
 * Divide um valor TOTAL em `n` parcelas, em centavos, sem o ruído do ponto flutuante, de forma que
 * a SOMA das parcelas bata exatamente com `valor`: calcula tudo em centavos inteiros
 * (`Math.round(valor * 100)`), dá `base = Math.floor(totalCentavos / n)` centavos pra cada parcela,
 * e distribui o resto (sempre `0 <= resto < n` centavos, NUNCA um valor grande) dando 1 centavo
 * EXTRA pra cada uma das ÚLTIMAS `resto` parcelas — nunca concentra o resto todo numa parcela só.
 *
 * Isso é diferente (e mais seguro) do que a 1ª versão desta função fazia (e do que
 * `splitPayableByCategory`, em `src/lib/compra-itens.ts`, ainda faz pro rateio por categoria):
 * "as `n - 1` primeiras arredondam pra `round2(valor / n)`, a ÚLTIMA absorve o resto inteiro".
 * Pra rateio por categoria isso é seguro porque o resto nunca passa de poucos centavos (é a
 * diferença entre duas somas já próximas). Aqui o resto podia ser um valor RELEVANTE (até quase
 * `valor` inteiro, quando `n` é grande e `valor` é pequeno) — e a última parcela ficava NEGATIVA
 * (bug encontrado na revisão: R$0,03 em 5x dava 4 parcelas de R$0,01 = R$0,04, sobrando -R$0,01 pra
 * última; R$70,20 em 120x também caía nisso). Calculando em centavos inteiros com `Math.floor`, o
 * resto nunca passa de `n - 1` centavos — espalhado 1 centavo por parcela, a diferença entre a maior
 * e a menor parcela nunca passa de 1 centavo, e nenhuma fica negativa nem zerada, desde que `valor`
 * tenha pelo menos `n` centavos — ver a validação correspondente em `POST /api/financeiro/pagar`
 * (`valor` precisa valer pelo menos 1 centavo por parcela), que rejeita ANTES de chamar esta função
 * quando isso não é possível.
 */
export function splitInstallments(valor: number, n: number): number[] {
  if (n <= 1) return [round2(valor)];
  const totalCentavos = Math.round(valor * 100);
  const base = Math.floor(totalCentavos / n);
  const resto = totalCentavos - base * n; // sempre 0 <= resto < n
  return Array.from({ length: n }, (_, i) => round2((i >= n - resto ? base + 1 : base) / 100));
}

// direction: 1 para conta a receber (entrada), -1 para conta a pagar (saída)
export function balanceDelta(direction: 1 | -1, status: FinanceEntryStatus, valor: number) {
  if (!PAID_STATUSES.includes(status)) return 0;
  return direction * valor;
}
