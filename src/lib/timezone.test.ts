import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDateKey, parseDayInput, spDateKey, spStartOfDay, storedDayKey } from "@/lib/timezone";

// Estes testes não podem depender do fuso do processo: rodar também com
//   TZ=UTC npm test ; TZ=America/Sao_Paulo npm test ; TZ=Asia/Tokyo npm test

test("parseDateKey aceita só dia que existe no calendário", () => {
  for (const ok of ["2026-10-25", "2026-01-01", "2026-12-31", "2028-02-29"]) assert.equal(parseDateKey(ok), ok);
  for (const bad of ["2026-02-30", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-10-32", "25/10/2026", "", "2026-10-25 10:00", "2026-10-25T03:00:00.000Z"]) {
    assert.equal(parseDateKey(bad), null, bad);
  }
  for (const bad of [null, undefined, 20261025, {}, [], true]) assert.equal(parseDateKey(bad), null);
});

test("parseDayInput: AAAA-MM-DD vira meia-noite de São Paulo (03:00Z)", () => {
  assert.equal(parseDayInput("2026-10-25")?.toISOString(), "2026-10-25T03:00:00.000Z");
  assert.equal(parseDayInput("2026-01-01")?.toISOString(), "2026-01-01T03:00:00.000Z");
  assert.equal(parseDayInput("2026-12-31")?.toISOString(), "2026-12-31T03:00:00.000Z");
  assert.equal(parseDayInput("2028-02-29")?.toISOString(), "2028-02-29T03:00:00.000Z");
  assert.equal(parseDayInput(" 2026-10-25 ")?.toISOString(), "2026-10-25T03:00:00.000Z");
});

test("parseDayInput: ida e volta com spDateKey para todos os dias de 2026 a 2028", () => {
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2029, 0, 1); t += 24 * 60 * 60 * 1000) {
    const key = new Date(t).toISOString().slice(0, 10);
    const date = parseDayInput(key);
    assert.ok(date, key);
    assert.equal(spDateKey(date), key);
    assert.equal(date.getTime(), spStartOfDay(key).getTime());
  }
});

test("parseDayInput: inválidos viram null (a rota responde 400)", () => {
  for (const bad of ["2026-02-30", "2026-13-01", "25/10/2026", "", "abc", "2026-10-25 10:00", null, undefined, 20261025, {}]) {
    assert.equal(parseDayInput(bad), null, String(bad));
  }
});

test("parseDayInput: ISO completo (aba antiga/Duplicar antigo) segue o dia gravado", () => {
  assert.equal(parseDayInput("2026-10-25T03:00:00.000Z")?.toISOString(), "2026-10-25T03:00:00.000Z"); // já novo: igual
  // Legado 00:00:00.000Z: o dia certo é o dia UTC (o digitado), NUNCA o dia anterior (no dia 1 mudaria o mês).
  assert.equal(parseDayInput("2026-10-25T00:00:00.000Z")?.toISOString(), "2026-10-25T03:00:00.000Z");
  assert.equal(parseDayInput("2026-11-01T00:00:00.000Z")?.toISOString(), "2026-11-01T03:00:00.000Z");
  assert.equal(parseDayInput("2027-01-01T00:00:00.000Z")?.toISOString(), "2027-01-01T03:00:00.000Z");
  assert.equal(parseDayInput("2026-10-25T00:00:00+00:00")?.toISOString(), "2026-10-25T03:00:00.000Z");
  // Hora real: o dia de São Paulo.
  assert.equal(parseDayInput("2026-10-26T01:30:00.000Z")?.toISOString(), "2026-10-25T03:00:00.000Z");
  assert.equal(parseDayInput("2026-10-25T00:00:00-03:00")?.toISOString(), "2026-10-25T03:00:00.000Z");
  assert.equal(parseDayInput("2026-10-25T00:00:00.001Z")?.toISOString(), "2026-10-24T03:00:00.000Z");
  // Sem fuso explícito: depende do fuso do processo, então é recusado. Lixo também.
  assert.equal(parseDayInput("2026-10-25T10:00:00"), null);
  assert.equal(parseDayInput("2026-10-25Tlixo"), null);
});

test("parseDayInput: faixa de anos 2000..2100 (0000-01-01 e 2206-10-25 viram 400, não 500 nem conta perdida)", () => {
  for (const bad of ["0000-01-01", "0201-05-05", "1999-12-31", "2101-01-01", "2206-10-25", "0000-01-01T00:00:00.000Z"]) {
    assert.equal(parseDayInput(bad), null, bad);
  }
  assert.equal(parseDayInput("2000-01-01")?.toISOString(), "2000-01-01T03:00:00.000Z");
  assert.equal(parseDayInput("2100-12-31")?.toISOString(), "2100-12-31T03:00:00.000Z");
  // parseDateKey (compartilhado com o RH) continua sem faixa de anos.
  assert.equal(parseDateKey("2206-10-25"), "2206-10-25");
});

test("storedDayKey: 00:00:00.000Z (legado) = dia UTC; 03:00Z e hora real = dia de São Paulo", () => {
  assert.equal(storedDayKey("2026-10-25T00:00:00.000Z"), "2026-10-25");
  assert.equal(storedDayKey("2026-11-01T00:00:00.000Z"), "2026-11-01");
  assert.equal(storedDayKey("2026-10-25T03:00:00.000Z"), "2026-10-25");
  assert.equal(storedDayKey(new Date("2026-11-01T03:00:00.000Z")), "2026-11-01");
  assert.equal(storedDayKey("2026-10-25T02:59:59.999Z"), "2026-10-24");
  assert.equal(storedDayKey("2026-10-25T14:23:11.123Z"), "2026-10-25");
  assert.equal(storedDayKey("lixo"), "");
});
