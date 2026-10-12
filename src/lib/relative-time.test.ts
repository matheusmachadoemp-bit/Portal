import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSince, isBankSyncStale } from "@/lib/relative-time";
import { presetRange } from "@/lib/period-presets";

const NOW = new Date("2026-10-12T15:00:00Z");

test("formatSince descreve o tempo decorrido em português", () => {
  assert.equal(formatSince("2026-10-12T14:59:40Z", NOW), "agora mesmo");
  assert.equal(formatSince("2026-10-12T14:55:00Z", NOW), "há 5 min");
  assert.equal(formatSince("2026-10-12T12:00:00Z", NOW), "há 3 h");
  assert.equal(formatSince("2026-10-11T12:00:00Z", NOW), "há 1 dia");
  assert.equal(formatSince("2026-10-09T12:00:00Z", NOW), "há 3 dias");
  assert.equal(formatSince("2026-10-12T16:00:00Z", NOW), "agora mesmo"); // relógio adiantado não vira texto negativo
  assert.equal(formatSince("lixo", NOW), "agora mesmo");
});

test("isBankSyncStale: parada se nunca atualizou ou passou de 36 h", () => {
  assert.equal(isBankSyncStale(null, NOW), true);
  assert.equal(isBankSyncStale("2026-10-12T10:00:00Z", NOW), false);
  assert.equal(isBankSyncStale("2026-10-11T03:00:00Z", NOW), false); // 36 h exatas
  assert.equal(isBankSyncStale("2026-10-11T02:59:00Z", NOW), true);
});

test("presetRange: este mês, mês passado, 30 dias (dias de São Paulo)", () => {
  assert.deepEqual(presetRange("thisMonth", "2026-10-12"), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(presetRange("thisMonth", "2026-02-10"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(presetRange("lastMonth", "2026-01-15"), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(presetRange("last30", "2026-10-12"), { from: "2026-09-13", to: "2026-10-12" });
  assert.deepEqual(presetRange("all", "2026-10-12"), { from: "", to: "" });
});

import { paymentMethodLabel } from "@/lib/bank-labels";

test("paymentMethodLabel: nomes legíveis para as formas do banco", () => {
  assert.equal(paymentMethodLabel("PIX"), "PIX");
  assert.equal(paymentMethodLabel("TRANSFERENCIA_MESMA_INSTITUICAO"), "Transferência (mesmo banco)");
  assert.equal(paymentMethodLabel("RESGATE_APLIC_FINANCEIRA"), "Resgate de aplicação");
  assert.equal(paymentMethodLabel("nova_forma_x"), "Nova forma x");
  assert.equal(paymentMethodLabel(null), null);
  assert.equal(paymentMethodLabel(""), null);
});
