import { test } from "node:test";
import assert from "node:assert/strict";
import { formatProductCode, isProductCategory, learnPrefix, nextCodeNumber, productCodePrefix } from "@/lib/ficha-code-core";

test("prefixo por categoria segue o padrão dos produtos já cadastrados (PZ, BG, SK)", () => {
  assert.equal(productCodePrefix("PIZZA_SALGADA"), "PZ");
  assert.equal(productCodePrefix("PIZZA_DOCE"), "PZ");
  assert.equal(productCodePrefix("BURGER"), "BG");
  for (const c of ["SUSHI", "SASHIMI", "TEMAKI", "URAMAKI", "HOT_ROLL", "ENTRADA", "DELIVERY", "LA_CARTE", "RODIZIO"]) {
    assert.equal(productCodePrefix(c), "SK", c);
  }
  assert.equal(productCodePrefix("CATEGORIA_NOVA_QUALQUER"), "PR"); // nunca fica sem prefixo
});

test("formatProductCode completa com zeros e cresce além de 3 dígitos", () => {
  assert.equal(formatProductCode("PZ", 1), "PZ-001");
  assert.equal(formatProductCode("PZ", 42), "PZ-042");
  assert.equal(formatProductCode("PZ", 999), "PZ-999");
  assert.equal(formatProductCode("PZ", 1000), "PZ-1000");
});

test("nextCodeNumber pega o maior número do prefixo + 1 e ignora códigos fora do padrão", () => {
  assert.equal(nextCodeNumber("PZ", []), 1);
  assert.equal(nextCodeNumber("PZ", ["PZ-001", "PZ-002", "PZ-007"]), 8); // não reaproveita buracos
  assert.equal(nextCodeNumber("PZ", ["pz-010", "PZ-3"]), 11); // minúsculas e sem zeros também contam
  assert.equal(nextCodeNumber("PZ", ["BG-050", "PZ-ESPECIAL", "XPZ-099", "PZ-001-B"]), 1); // outro prefixo/texto livre não interfere
  assert.equal(nextCodeNumber("SK", ["SK-001", "SK-002"]), 3);
});

test("learnPrefix segue o prefixo que a categoria já usa; sem histórico usa o padrão", () => {
  assert.equal(learnPrefix("COMBO", []), "CB");
  assert.equal(learnPrefix("COMBO", ["CO-001", "CO-002", "CB-001"]), "CO"); // série existente mais comum
  assert.equal(learnPrefix("ESFIHA_DOCE", ["codigo livre", "xyz"]), "EF"); // nada no padrão → padrão
  assert.equal(learnPrefix("BURGER", ["bg-004", "BG-005"]), "BG"); // maiúscula/minúscula
});

test("isProductCategory só aceita valores do enum", () => {
  assert.equal(isProductCategory("BURGER"), true);
  assert.equal(isProductCategory("burger"), false);
  assert.equal(isProductCategory(undefined), false);
  assert.equal(isProductCategory("toString"), false);
});
