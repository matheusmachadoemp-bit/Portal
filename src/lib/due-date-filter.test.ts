// O filtro roda no navegador do usuário (São Paulo). O fuso do processo precisa ser fixado ANTES de qualquer
// cálculo de data para o teste não depender de onde ele roda (CI em UTC, máquina em Tokyo etc.).
process.env.TZ = "America/Sao_Paulo";

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesDueDateFilter, type DueDateFilterKey } from "@/lib/due-date-filter";

const SETTLED = ["PAGO", "CANCELADO"];
const agora = new Date("2026-10-25T15:00:00Z"); // domingo 25/10/2026, 12:00 em São Paulo

function casa(venc: string, key: DueDateFilterKey, custom: { from?: string; to?: string } = {}, now = agora, status = "EM_ABERTO") {
  return matchesDueDateFilter(new Date(venc), status, key, custom, SETTLED, now);
}

test("vence hoje: vencimento de hoje (03:00Z) não é atrasado", () => {
  assert.equal(casa("2026-10-25T03:00:00.000Z", "atrasadas"), false);
  assert.equal(casa("2026-10-25T03:00:00.000Z", "hoje"), true);
  assert.equal(casa("2026-10-24T03:00:00.000Z", "atrasadas"), true);
  assert.equal(casa("2026-10-24T03:00:00.000Z", "hoje"), false);
  assert.equal(casa("2026-10-24T03:00:00.000Z", "atrasadas", {}, agora, "PAGO"), false);
});

test("semana e mês usam o dia de São Paulo", () => {
  assert.equal(casa("2026-10-25T03:00:00.000Z", "semana"), true); // domingo, fecha a semana de segunda 19/10
  assert.equal(casa("2026-10-26T03:00:00.000Z", "semana"), false); // segunda seguinte
  assert.equal(casa("2026-10-26T03:00:00.000Z", "mes"), true);
  assert.equal(casa("2026-11-01T03:00:00.000Z", "mes"), false);
  assert.equal(casa("2026-11-01T03:00:00.000Z", "mes", {}, new Date("2026-11-01T15:00:00Z")), true);
});

test("personalizado 25 a 25 pega só o vencimento do dia 25 (03:00Z)", () => {
  const c = { from: "2026-10-25", to: "2026-10-25" };
  assert.equal(casa("2026-10-24T03:00:00.000Z", "personalizado", c), false);
  assert.equal(casa("2026-10-25T03:00:00.000Z", "personalizado", c), true);
  assert.equal(casa("2026-10-26T02:59:59.999Z", "personalizado", c), true);
  assert.equal(casa("2026-10-26T03:00:00.000Z", "personalizado", c), false);
});

test("personalizado sem datas (ou com data impossível) não filtra", () => {
  assert.equal(casa("2026-10-24T03:00:00.000Z", "personalizado", { from: "", to: "" }), true);
  assert.equal(casa("2026-10-24T03:00:00.000Z", "personalizado", { from: "2026-10-25" }), true);
  assert.equal(casa("2026-10-24T03:00:00.000Z", "personalizado", { from: "2026-02-30", to: "2026-02-30" }), true);
});
