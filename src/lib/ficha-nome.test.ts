import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanProductName,
  duplicateProductNameMessage,
  findProductWithSameName,
  normalizeProductName,
} from "@/lib/ficha-nome";

test("normalizeProductName ignora maiúscula, acento e espaço sobrando", () => {
  assert.equal(normalizeProductName("Ceviche Branco"), "ceviche branco");
  assert.equal(normalizeProductName("  CEVICHÉ   branco "), "ceviche branco");
  assert.equal(normalizeProductName("Pizza Frango c/ Catupiry"), "pizza frango c/ catupiry");
  assert.equal(normalizeProductName("Açaí"), "acai");
  assert.equal(normalizeProductName("Rodizio\u00a0Adulto"), "rodizio adulto"); // espaço não separável também conta como espaço
  assert.equal(normalizeProductName("   "), "");
});

test("normalizeProductName: acento decomposto, maiúsculas com acento", () => {
  assert.equal(normalizeProductName("Cafe\u0301"), "cafe"); // "é" escrito como e + acento combinante (NFD)
  assert.equal(normalizeProductName("AÇAÍ"), "acai");
  assert.equal(normalizeProductName("açai"), normalizeProductName("AÇAÍ"));
});

test("normalizeProductName: travessão, aspas curvas e caracteres invisíveis colados de outros programas", () => {
  assert.equal(normalizeProductName("Combo 1 \u2013 40 peças"), normalizeProductName("Combo 1 - 40 peças")); // en dash
  assert.equal(normalizeProductName("Combo 1 \u2014 40 peças"), normalizeProductName("Combo 1 - 40 peças")); // em dash
  assert.equal(normalizeProductName("Ceviche\u200b Branco"), "ceviche branco"); // espaço de largura zero
  assert.equal(normalizeProductName("Ceviche\u00adBranco"), "cevichebranco"); // hífen suave some
  assert.equal(normalizeProductName("D\u2019Ouro"), normalizeProductName("D'Ouro")); // aspa curva
});

test("nome que só tem acento/caractere invisível vira vazio (a rota recusa)", () => {
  assert.equal(normalizeProductName("\u200b\u200b"), "");
  assert.equal(normalizeProductName("\u0301"), "");
  assert.equal(cleanProductName("\u200b Ceviche\u200b  Branco "), "Ceviche Branco");
});

test("normalizeProductName não confunde nomes realmente diferentes", () => {
  assert.notEqual(normalizeProductName("Ceviche Misto"), normalizeProductName("Ceviche Misto - la carte"));
  assert.notEqual(normalizeProductName("Combo 1 - 40 peças"), normalizeProductName("Combo 2 - 38 peças"));
  assert.notEqual(normalizeProductName("Hot Philadelphia 10"), normalizeProductName("Hot Philadelphia 20"));
});

test("cleanProductName tira espaço das pontas e junta espaços repetidos", () => {
  assert.equal(cleanProductName("  Ceviche   Branco  "), "Ceviche Branco");
  assert.equal(cleanProductName("Temaki\tSalmão\n"), "Temaki Salmão");
});

test("findProductWithSameName acha o produto repetido e ignora o próprio ao editar", () => {
  const list = [
    { id: "a", name: "Ceviche Branco", code: "SK-045" },
    { id: "b", name: "Temaki Salmão", code: "SK-010" },
  ];
  assert.equal(findProductWithSameName(list, "ceviche  BRANCO")?.id, "a");
  assert.equal(findProductWithSameName(list, "TEMAKI SALMAO")?.code, "SK-010");
  assert.equal(findProductWithSameName(list, "Ceviche Misto"), null);
  assert.equal(findProductWithSameName(list, "Ceviche Branco", "a"), null); // editando o próprio produto
  assert.equal(findProductWithSameName(list, "   "), null); // nome vazio é tratado em outra validação
});

test("findProductWithSameName com cadastros antigos já repetidos devolve o primeiro da lista", () => {
  const list = [
    { id: "a", name: "Ceviche Branco", code: "SK-045" },
    { id: "b", name: "ceviche branco", code: "SK-047" },
  ];
  assert.equal(findProductWithSameName(list, "Ceviche Branco")?.id, "a");
  assert.equal(findProductWithSameName(list, "Ceviche Branco", "a")?.id, "b"); // editando o 1º, ainda existe o 2º
});

test("mensagem de nome repetido cita o produto existente, o código e a categoria", () => {
  const msg = duplicateProductNameMessage({ name: "Ceviche Branco", code: "SK-045" }, "Rodízio");
  assert.match(msg, /Ceviche Branco/);
  assert.match(msg, /SK-045/);
  assert.match(msg, /na categoria Rodízio/);
  assert.match(duplicateProductNameMessage({ name: "X", code: "PZ-001" }), /nesta categoria/);
});
