import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHorasTrabalhadas } from "@/lib/rh-helpers";

// Achado da auditoria geral (RH/Jornada/ponto eletrônico): turno que cruza a meia-noite
// (entrada num dia, saída no dia seguinte) calculava 0h porque `saida` ("HH:MM", sem informação de
// dia) ficava numericamente menor que `entrada`. Ver `computeHorasTrabalhadas` em rh-helpers.ts.

test("turno dentro do mesmo dia (sem virada) continua calculando normalmente", () => {
  assert.equal(computeHorasTrabalhadas({ entrada: "08:00", saida: "17:00" }), 9);
});

test("turno dentro do mesmo dia com intervalo de almoço", () => {
  assert.equal(
    computeHorasTrabalhadas({ entrada: "08:00", saidaAlmoco: "12:00", retornoAlmoco: "13:00", saida: "18:00" }),
    9
  );
});

test("turno que cruza a meia-noite (22h às 6h) calcula 8h, não 0h", () => {
  assert.equal(computeHorasTrabalhadas({ entrada: "22:00", saida: "06:00" }), 8);
});

test("turno que cruza a meia-noite com almoço dentro do mesmo dia (antes da virada)", () => {
  // Entrada 18:00, almoço 22:00-23:00 (ainda no mesmo dia), saída 02:00 (dia seguinte) = 7h.
  assert.equal(
    computeHorasTrabalhadas({ entrada: "18:00", saidaAlmoco: "22:00", retornoAlmoco: "23:00", saida: "02:00" }),
    7
  );
});

test("turno que cruza a meia-noite com almoço que também cruza a meia-noite", () => {
  // Entrada 22:00, almoço 23:50-00:10 (cruza meia-noite), saída 06:00 = 8h - 20min de almoço.
  const horas = computeHorasTrabalhadas({ entrada: "22:00", saidaAlmoco: "23:50", retornoAlmoco: "00:10", saida: "06:00" });
  assert.equal(horas, Math.round(((8 * 60 - 20) / 60) * 100) / 100);
});

test("entrada e saída iguais continua retornando 0 (dado inconsistente)", () => {
  assert.equal(computeHorasTrabalhadas({ entrada: "08:00", saida: "08:00" }), 0);
});

test("sem entrada ou sem saída retorna 0", () => {
  assert.equal(computeHorasTrabalhadas({ entrada: "08:00", saida: null }), 0);
  assert.equal(computeHorasTrabalhadas({ entrada: null, saida: "17:00" }), 0);
});
