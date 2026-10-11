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
  assert.equal(normalizeProductName("Rodizio Adulto"), "rodizio adulto"); // espaço não separável também conta como espaço
  assert.equal(normalizeProductName("   "), "");
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

test("mensagem de nome repetido cita o produto existente e o código", () => {
  const msg = duplicateProductNameMessage({ name: "Ceviche Branco", code: "SK-045" });
  assert.match(msg, /Ceviche Branco/);
  assert.match(msg, /SK-045/);
});
