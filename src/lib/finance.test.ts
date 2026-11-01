import { test } from "node:test";
import assert from "node:assert/strict";
import { splitInstallments } from "@/lib/finance";

function soma(valores: number[]): number {
  return Math.round(valores.reduce((acc, v) => acc + v, 0) * 100) / 100;
}

test("splitInstallments: 1200 em 12x dá 12 parcelas de 100 cada", () => {
  const parcelas = splitInstallments(1200, 12);
  assert.deepEqual(parcelas, Array(12).fill(100));
  assert.equal(soma(parcelas), 1200);
});

test("splitInstallments: 1000 em 3x não divide exato — a diferença de 1 centavo cai na ÚLTIMA parcela", () => {
  const parcelas = splitInstallments(1000, 3);
  assert.deepEqual(parcelas, [333.33, 333.33, 333.34]);
  assert.equal(soma(parcelas), 1000);
});

test("splitInstallments: n<=1 devolve o próprio valor arredondado, numa parcela só", () => {
  assert.deepEqual(splitInstallments(1.005, 1), [1.01]);
  assert.deepEqual(splitInstallments(50, 0), [50]);
});

// Achado do Teulis na revisão: com a estratégia antiga ("as n-1 primeiras arredondam, a ÚLTIMA
// absorve o resto inteiro"), R$0,03 em 5x gerava a 5ª parcela com valor -0,01 (negativo) — as 4
// primeiras arredondavam pra R$0,01 cada (R$0,04 no total), sobrando -R$0,01 pra última. Depois da
// correção (centavos inteiros + resto espalhado 1 centavo por parcela), isso nunca mais acontece.
test("splitInstallments: nenhuma parcela fica negativa mesmo com valor pequeno pra muitas parcelas (bug da revisão)", () => {
  const parcelas = splitInstallments(0.03, 5);
  assert.deepEqual(parcelas, [0, 0, 0.01, 0.01, 0.01]);
  assert.ok(parcelas.every((v) => v >= 0));
  assert.equal(soma(parcelas), 0.03);
});

test("splitInstallments: R$70,20 em 120x (outro caso plausível encontrado na revisão) soma certo e nenhuma parcela negativa", () => {
  const parcelas = splitInstallments(70.2, 120);
  assert.equal(parcelas.length, 120);
  assert.ok(parcelas.every((v) => v >= 0));
  assert.equal(soma(parcelas), 70.2);
});

test("splitInstallments: diferença entre a maior e a menor parcela nunca passa de 1 centavo, pra várias combinações", () => {
  const casos: Array<[number, number]> = [
    [1, 18],
    [500, 23],
    [999.99, 7],
    [0.1, 10],
    [120, 120],
  ];
  for (const [valor, n] of casos) {
    const parcelas = splitInstallments(valor, n);
    assert.equal(parcelas.length, n);
    const max = Math.max(...parcelas);
    const min = Math.min(...parcelas);
    assert.ok(Math.round((max - min) * 100) <= 1, `valor=${valor} n=${n} max=${max} min=${min}`);
    assert.equal(soma(parcelas), Math.round(valor * 100) / 100);
  }
});
