import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHorasNoturnasReaisTimeEntry, competenciaRange } from "@/lib/adicional-noturno";

// Janela noturna fixa (Art. 73 da CLT, decisão tomada com o usuário): 22h00 às 05h00.

test("turno totalmente fora da janela noturna (08h-17h) não gera hora noturna", () => {
  assert.equal(computeHorasNoturnasReaisTimeEntry({ entrada: "08:00", saida: "17:00" }), 0);
});

test("turno 22:00-06:00 (cruza meia-noite) conta só as 7h da janela (22h-05h), não as 8h inteiras", () => {
  assert.equal(computeHorasNoturnasReaisTimeEntry({ entrada: "22:00", saida: "06:00" }), 7);
});

test("turno inteiro dentro da janela (23:00-04:00) conta as 5h cheias", () => {
  assert.equal(computeHorasNoturnasReaisTimeEntry({ entrada: "23:00", saida: "04:00" }), 5);
});

test("turno que começa de madrugada, antes das 05h (02:00-10:00): só as 3h até as 05h contam", () => {
  assert.equal(computeHorasNoturnasReaisTimeEntry({ entrada: "02:00", saida: "10:00" }), 3);
});

test("turno que começa à tarde e entra na janela (20:00-23:00): só 1h (22h-23h) conta", () => {
  assert.equal(computeHorasNoturnasReaisTimeEntry({ entrada: "20:00", saida: "23:00" }), 1);
});

test("almoço dentro da janela noturna é descontado da hora noturna, igual é descontado da hora total", () => {
  // Entrada 22:00, almoço 00:00-01:00 (1h, dentro da janela), saída 05:00 -> 7h de janela - 1h de
  // almoço = 6h noturnas.
  assert.equal(
    computeHorasNoturnasReaisTimeEntry({ entrada: "22:00", saidaAlmoco: "00:00", retornoAlmoco: "01:00", saida: "05:00" }),
    6
  );
});

test("almoço fora da janela noturna não desconta nada da hora noturna", () => {
  // Entrada 18:00, almoço 19:00-20:00 (antes da janela), saída 23:00 -> só 22h-23h (1h) é noturno;
  // o almoço, inteiro fora da janela, não tira nada dessa 1h.
  assert.equal(
    computeHorasNoturnasReaisTimeEntry({ entrada: "18:00", saidaAlmoco: "19:00", retornoAlmoco: "20:00", saida: "23:00" }),
    1
  );
});

test("sem entrada ou sem saída retorna 0 (mesmo critério de computeHorasTrabalhadas)", () => {
  assert.equal(computeHorasNoturnasReaisTimeEntry({ entrada: "22:00", saida: null }), 0);
  assert.equal(computeHorasNoturnasReaisTimeEntry({ entrada: null, saida: "06:00" }), 0);
});

test("competenciaRange: mês comum (outubro/2026) vai de 01/10 a 01/11, exclusive", () => {
  const { from, to } = competenciaRange(10, 2026);
  assert.equal(from.toISOString(), "2026-10-01T03:00:00.000Z"); // meia-noite de SP em UTC
  assert.equal(to.toISOString(), "2026-11-01T03:00:00.000Z");
});

test("competenciaRange: competência de dezembro vira janeiro do ano seguinte", () => {
  const { from, to } = competenciaRange(12, 2026);
  assert.equal(from.toISOString(), "2026-12-01T03:00:00.000Z");
  assert.equal(to.toISOString(), "2027-01-01T03:00:00.000Z");
});
