import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeIncoming, planSync, type ExistingBankTx, type NormalizedBankTx } from "@/lib/bank-sync";

const NOW = new Date("2026-10-12T12:00:00Z");

function ok(raw: unknown): NormalizedBankTx {
  const r = normalizeIncoming(raw, NOW);
  assert.equal(r.ok, true, JSON.stringify(r));
  return (r as { ok: true; tx: NormalizedBankTx }).tx;
}

const pix = {
  id: "c843933b-6898-47d9-a1b0-5fdb4653d5f6",
  date: "2026-10-12T02:44:45.967Z",
  description: "PIX RECEBIDO   34735243000190",
  amount: "119.68",
  type: "CREDIT",
  status: "POSTED",
  category: "Transfer - PIX",
  operationType: "PIX",
  counterpart: "34.735.243 RODRIGO RIBEIRO DE SANT ANNA",
};

test("normalizeIncoming: PIX recebido vira ENTRADA no dia de São Paulo (02:44 UTC ainda é o dia anterior)", () => {
  const tx = ok(pix);
  assert.equal(tx.direction, "ENTRADA");
  assert.equal(tx.valor, 119.68);
  assert.equal(tx.dateKey, "2026-10-11"); // 02:44Z = 23:44 do dia 11 em São Paulo
  assert.equal(tx.date.toISOString(), "2026-10-11T03:00:00.000Z"); // meia-noite de São Paulo
  assert.equal(tx.occurredAt.toISOString(), "2026-10-12T02:44:45.967Z");
  assert.equal(tx.paymentMethod, "PIX");
  assert.equal(tx.bankCategory, "Transfer - PIX");
  assert.equal(tx.counterpart, "34.735.243 RODRIGO RIBEIRO DE SANT ANNA");
  assert.equal(tx.pendingAtBank, false);
  assert.equal(tx.descricao, "PIX RECEBIDO 34735243000190"); // espaços repetidos juntados
});

test("normalizeIncoming: DEBIT vira SAIDA, valor sempre positivo e com centavos corretos", () => {
  assert.equal(ok({ ...pix, type: "DEBIT", amount: "-10.10" }).direction, "SAIDA");
  assert.equal(ok({ ...pix, type: "debit", amount: -10.1 }).valor, 10.1);
  assert.equal(ok({ ...pix, amount: "0.1" }).valor, 0.1);
  assert.equal(ok({ ...pix, amount: "1234,56" }).valor, 1234.56); // vírgula decimal
  assert.equal(ok({ ...pix, amount: 0.1 + 0.2 }).valor, 0.3); // sem ruído de ponto flutuante
});

test("normalizeIncoming: pendente no banco e descrição vazia", () => {
  assert.equal(ok({ ...pix, status: "PENDING" }).pendingAtBank, true);
  assert.equal(ok({ ...pix, description: "  ", category: null }).descricao, "PIX");
  assert.equal(ok({ ...pix, description: undefined, operationType: undefined, category: undefined }).descricao, "Lançamento sem descrição");
});

test("normalizeIncoming recusa lançamento inválido, com o motivo", () => {
  const bad = (raw: unknown) => {
    const r = normalizeIncoming(raw, NOW);
    assert.equal(r.ok, false);
    return (r as { ok: false; error: string }).error;
  };
  assert.match(bad(null), /inválido/);
  assert.match(bad({ ...pix, id: "" }), /identificador/);
  assert.match(bad({ ...pix, id: 42 }), /identificador/);
  assert.match(bad({ ...pix, date: "ontem" }), /data inválida/);
  assert.match(bad({ ...pix, date: undefined }), /sem data/);
  assert.match(bad({ ...pix, date: "1999-01-01T00:00:00Z" }), /fora do intervalo/);
  assert.match(bad({ ...pix, date: "2026-12-31T00:00:00Z" }), /fora do intervalo/);
  assert.match(bad({ ...pix, amount: "abc" }), /valor/);
  assert.match(bad({ ...pix, amount: 0 }), /valor/);
  assert.match(bad({ ...pix, amount: "0.004" }), /valor/);
  assert.match(bad({ ...pix, amount: 1e12 }), /valor/);
  assert.match(bad({ ...pix, type: "TRANSFER" }), /CREDIT ou DEBIT/);
});

test("normalizeIncoming limita o tamanho dos textos", () => {
  const tx = ok({ ...pix, description: "x".repeat(1000), counterpart: "y".repeat(1000) });
  assert.equal(tx.descricao.length, 300);
  assert.equal(tx.counterpart?.length, 200);
});

// ------------------------------------------------------------------------------------------------

function existing(over: Partial<ExistingBankTx> & { id: string }): ExistingBankTx {
  const tx = ok(pix);
  return {
    externalId: tx.externalId,
    source: "OPEN_FINANCE",
    status: "PENDENTE",
    direction: tx.direction,
    valor: tx.valor,
    date: tx.date,
    occurredAt: tx.occurredAt,
    descricao: tx.descricao,
    counterpart: tx.counterpart,
    bankCategory: tx.bankCategory,
    paymentMethod: tx.paymentMethod,
    pendingAtBank: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...over,
  };
}

test("planSync: lançamento novo é criado; o mesmo lote de novo não muda nada (idempotente)", () => {
  const tx = ok(pix);
  const first = planSync({ incoming: [tx], existing: [], orphans: [] });
  assert.equal(first.creates.length, 1);
  const second = planSync({ incoming: [tx], existing: [existing({ id: "a" })], orphans: [] });
  assert.deepEqual([second.creates.length, second.updates.length, second.unchanged], [0, 0, 1]);
});

test("planSync: pendente que compensou é atualizado; mudança de valor num conciliado desfaz o vínculo", () => {
  const posted = ok(pix);
  const p1 = planSync({ incoming: [posted], existing: [existing({ id: "a", pendingAtBank: true })], orphans: [] });
  assert.equal(p1.updates.length, 1);
  assert.equal(p1.updates[0].tx.pendingAtBank, false);
  assert.equal(p1.updates[0].resetMatch, false);

  const changed = ok({ ...pix, amount: "120.00" });
  const p2 = planSync({ incoming: [changed], existing: [existing({ id: "a", status: "CONCILIADO" })], orphans: [] });
  assert.equal(p2.updates[0].resetMatch, true);
  const p3 = planSync({ incoming: [changed], existing: [existing({ id: "a", status: "PENDENTE" })], orphans: [] });
  assert.equal(p3.updates[0].resetMatch, false);
});

test("planSync: a descrição só é reescrita em lançamento que veio do banco, não em um adotado de arquivo", () => {
  const tx = ok({ ...pix, description: "PIX RECEBIDO NOVO TEXTO" });
  const fromBank = planSync({ incoming: [tx], existing: [existing({ id: "a", source: "OPEN_FINANCE" })], orphans: [] });
  assert.equal(fromBank.updates[0].setDescricao, true);
  const fromFile = planSync({ incoming: [tx], existing: [existing({ id: "a", source: "ARQUIVO" })], orphans: [] });
  assert.equal(fromFile.updates.length, 0); // só a descrição difere: nada a regravar
  assert.equal(fromFile.unchanged, 1);
  const fromFileAndPending = planSync({
    incoming: [tx],
    existing: [existing({ id: "a", source: "ARQUIVO", pendingAtBank: true })],
    orphans: [],
  });
  assert.equal(fromFileAndPending.updates[0].setDescricao, false); // mudou outra coisa, mas a descrição continua a do arquivo
});

test("planSync: adota lançamento de arquivo (mesmo dia SP, sentido e valor) em vez de duplicar, um para um", () => {
  const mk = (id: string, amount: string, hourUtc: string) =>
    ok({ id, date: `2026-10-10T${hourUtc}:00:00Z`, description: "PIX", amount, type: "CREDIT" });
  const incoming = [mk("b1", "50.00", "12"), mk("b2", "50.00", "15"), mk("b3", "50.00", "18"), mk("b4", "75.00", "12")];
  const day = incoming[0].date; // 10/10 meia-noite SP
  const orphan = (id: string, valor: number, minute: number): ExistingBankTx =>
    existing({ id, externalId: null, source: "ARQUIVO", valor, date: day, occurredAt: null, createdAt: new Date(2026, 9, 5, 10, minute) });
  const plan = planSync({ incoming, existing: [], orphans: [orphan("o1", 50, 1), orphan("o2", 50, 2), orphan("o3", 99, 3)] });
  assert.deepEqual(plan.adoptions.map((a) => [a.orphanId, a.tx.externalId]), [["o1", "b1"], ["o2", "b2"]]);
  assert.deepEqual(plan.creates.map((c) => c.externalId).sort(), ["b3", "b4"]); // sem par: cria
});

test("planSync: não adota lançamento de arquivo de outro dia, outro sentido ou outro valor", () => {
  const tx = ok({ id: "b1", date: "2026-10-10T12:00:00Z", amount: "50.00", type: "CREDIT" });
  const base = { externalId: null, source: "ARQUIVO", occurredAt: null, createdAt: new Date("2026-10-05T00:00:00Z") };
  const otherDay = existing({ id: "o1", ...base, valor: 50, date: new Date("2026-10-11T03:00:00Z") });
  const otherDir = existing({ id: "o2", ...base, valor: 50, direction: "SAIDA", date: tx.date });
  const otherValue = existing({ id: "o3", ...base, valor: 50.01, date: tx.date });
  const plan = planSync({ incoming: [tx], existing: [], orphans: [otherDay, otherDir, otherValue] });
  assert.equal(plan.adoptions.length, 0);
  assert.equal(plan.creates.length, 1);
});

test("planSync: mesmo id repetido no lote vale o último", () => {
  const a = ok({ ...pix, amount: "10.00" });
  const b = ok({ ...pix, amount: "11.00" });
  const plan = planSync({ incoming: [a, b], existing: [], orphans: [] });
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].valor, 11);
});

test("planSync: pendentes que sumiram só são removidos com janela completa e se ainda PENDENTES", () => {
  const tx = ok(pix);
  const pending = [
    { id: "p1", externalId: "gone-1", status: "PENDENTE" },
    { id: "p2", externalId: "gone-2", status: "CONCILIADO" },
    { id: "p3", externalId: tx.externalId, status: "PENDENTE" }, // veio no lote: fica
  ];
  const without = planSync({ incoming: [tx], existing: [], orphans: [], windowPending: pending, windowComplete: false });
  assert.deepEqual(without.removals, []);
  const withWindow = planSync({ incoming: [tx], existing: [], orphans: [], windowPending: pending, windowComplete: true });
  assert.deepEqual(withWindow.removals, ["p1"]);
});
