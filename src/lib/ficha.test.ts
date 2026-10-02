import { test } from "node:test";
import assert from "node:assert/strict";
import { ingredientCostPerUnit, productIngredientCost, productTotalCost, cmvPercent } from "@/lib/ficha";

/**
 * Trava o cálculo de custo da Ficha Técnica contra o achado de produção de 02/10/2026 (loja
 * Zarki Sushi, perfil Supervisor): "Combo Salmão 20 peças" aparecia na tela com custo de R$ 22,76
 * e CMV de 25,6%, quando o esperado (conta manual, preço × quantidade ajustado pela perda) é
 * ≈ R$ 44,32 — bem mais que o dobro. Causa raiz: `ingredientCostPerUnit` dividia `precoAtual` por
 * `quantidadeEmbalagem`, tratando `precoAtual` como "preço da embalagem inteira comprada", quando
 * na verdade o resto do sistema mantém `precoAtual` como preço de 1 `unidade` (ver o comentário na
 * definição de `ingredientCostPerUnit`, em `@/lib/estoque`, para a prova com `valorUnitario` de
 * `PurchaseItem`). Isso deflacionava o custo de qualquer insumo com embalagem > 1 (aqui: Arroz,
 * embalagem de 5kg, e Nori, embalagem de 50un) — só o Salmão (embalagem de 1kg) não era afetado,
 * o que levou à pista falsa "o salmão está sendo ignorado da soma" na investigação inicial.
 *
 * Dados da ficha técnica (exatamente os do achado de produção):
 * - Salmão Fresco: 0,3 kg usados, R$ 68/kg, 5% de perda
 * - Arroz para Sushi: 0,4 kg usados, R$ 12/kg, 2% de perda (embalagem de compra: 5kg)
 * - Alga Nori: 10 un usadas, R$ 1,80/un, sem perda (embalagem de compra: 50un)
 */
test("ingredientCostPerUnit usa precoAtual direto, sem dividir pela embalagem", () => {
  // Insumos "completos" (com quantidadeEmbalagem, como vêm do Prisma) continuam passando sem
  // problema — quantidadeEmbalagem só não entra mais na conta (ver comentário na definição, em
  // @/lib/estoque).
  // Salmão: embalagem de compra = 1kg, então o bug antigo (precoAtual / quantidadeEmbalagem)
  // coincidia com o valor certo aqui (68/1 = 68) — por isso o salmão não "sumia" da conta, ele só
  // nunca foi o problema (a pista falsa da investigação inicial).
  const salmao = { precoAtual: 68, quantidadeEmbalagem: 1 };
  assert.equal(ingredientCostPerUnit(salmao), 68);
  // Arroz: embalagem de compra = 5kg — o bug antigo devolvia 12/5 = 2.4 (errado); o certo é 12
  // (R$/kg, igual ao preço pago na compra de 25kg por R$300 do seed).
  const arroz = { precoAtual: 12, quantidadeEmbalagem: 5 };
  assert.equal(ingredientCostPerUnit(arroz), 12);
  // Nori: embalagem de compra = 50un — o bug antigo devolvia 1.8/50 = 0.036 (errado); o certo é
  // 1.8 (R$/un).
  const nori = { precoAtual: 1.8, quantidadeEmbalagem: 50 };
  assert.equal(ingredientCostPerUnit(nori), 1.8);
});

test("Combo Salmão 20 peças: custo total e CMV% batem com a conta manual (não com o valor com bug)", () => {
  const salmao = { precoAtual: 68, quantidadeEmbalagem: 1 };
  const arroz = { precoAtual: 12, quantidadeEmbalagem: 5 };
  const nori = { precoAtual: 1.8, quantidadeEmbalagem: 50 };

  const ingredients = [
    { quantidadeUsada: 0.3, percentualPerda: 5, ingredient: salmao }, // 0,3 × 68 × 1,05 = 21,42
    { quantidadeUsada: 0.4, percentualPerda: 2, ingredient: arroz }, // 0,4 × 12 × 1,02 = 4,896
    { quantidadeUsada: 10, percentualPerda: 0, ingredient: nori }, // 10 × 1,80 × 1 = 18
  ];

  assert.ok(Math.abs(productIngredientCost(ingredients[0]) - 21.42) < 0.001, "custo do salmão");
  assert.ok(Math.abs(productIngredientCost(ingredients[1]) - 4.896) < 0.001, "custo do arroz");
  assert.ok(Math.abs(productIngredientCost(ingredients[2]) - 18) < 0.001, "custo do nori");

  const totalCost = productTotalCost(ingredients);
  // 21,42 + 4,896 + 18 = 44,316 — dentro da faixa "R$ 43,20 a R$ 44,40" calculada à mão no achado
  // de produção (a faixa veio de arredondamentos manuais; o valor exato do sistema é 44,316).
  assert.ok(totalCost > 43.2 && totalCost < 44.4, `custo total esperado ≈ R$44,32, veio ${totalCost}`);
  assert.ok(
    Math.abs(totalCost - 22.76) > 1,
    "custo total não pode mais bater com o valor ANTIGO (com bug) de R$22,76 — esse era o sintoma do achado de produção"
  );

  const precoVenda = 89; // preço de venda cadastrado do Combo Salmão 20 peças
  const cmv = cmvPercent(totalCost, precoVenda);
  // 44,316 / 89 ≈ 49,8% — bem diferente dos 25,6% mostrados com o bug.
  assert.ok(cmv > 48 && cmv < 51, `CMV% esperado ≈ 49,8%, veio ${cmv}`);
});
