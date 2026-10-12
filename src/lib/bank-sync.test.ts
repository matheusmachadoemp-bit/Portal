import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeIncoming, pairTransactions, planSync, type ExistingBankTx, type NormalizedBankTx } from "@/lib/bank-sync";

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
  assert.equal(tx.occurredAt?.toISOString(), "2026-10-12T02:44:45.967Z");
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

test("planSync: não adota lançamento de arquivo com 2 dias de diferença, outro sentido ou outro valor", () => {
  const tx = ok({ id: "b1", date: "2026-10-10T12:00:00Z", amount: "50.00", type: "CREDIT" });
  const base = { externalId: null, source: "ARQUIVO", occurredAt: null, createdAt: new Date("2026-10-05T00:00:00Z") };
  const otherDay = existing({ id: "o1", ...base, valor: 50, date: new Date("2026-10-12T03:00:00Z") });
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

test("planSync: pendentes que sumiram só são removidos com janela completa, dentro da faixa e se ninguém mexeu neles", () => {
  const tx = ok(pix); // 12/10 02:44Z
  const pend = (id: string, externalId: string, over: Partial<ExistingBankTx> = {}) =>
    existing({ id, externalId, pendingAtBank: true, valor: 31 + id.length, occurredAt: new Date("2026-10-11T15:00:00Z"), ...over });
  const rows = [
    pend("p1", "gone-1"), // intocado: sai
    pend("p2", "gone-2", { status: "CONCILIADO", matchedType: "PAYABLE", matchedId: "x" }), // já conciliado: fica e pede revisão
    pend("p3", "gone-3", { observacoes: "ligar pro fornecedor" }), // tem observação: fica e pede revisão
    pend("p4", tx.externalId), // veio no lote: fica
    pend("p5", "old-1", { occurredAt: new Date("2026-09-01T15:00:00Z") }), // fora da faixa: não toca
  ];
  const without = planSync({ incoming: [tx], existing: rows, orphans: [], windowComplete: false });
  assert.deepEqual(without.removals, []);
  const withWindow = planSync({
    incoming: [tx],
    existing: rows,
    orphans: [],
    windowComplete: true,
    window: { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-12T23:59:59Z") },
  });
  assert.deepEqual(withWindow.removals, ["p1"]);
  assert.equal(withWindow.staleKept, 2);
});

test("planSync: sem `window`, a faixa é a dos próprios lançamentos do lote", () => {
  const a = ok({ id: "a", date: "2026-10-05T15:00:00Z", amount: "10", type: "DEBIT" });
  const b = ok({ id: "b", date: "2026-10-10T15:00:00Z", amount: "20", type: "DEBIT" });
  const inside = existing({ id: "p1", externalId: "gone", pendingAtBank: true, valor: 33, occurredAt: new Date("2026-10-07T15:00:00Z") });
  const outside = existing({ id: "p2", externalId: "gone-2", pendingAtBank: true, valor: 34, occurredAt: new Date("2026-10-01T15:00:00Z") });
  const plan = planSync({ incoming: [a, b], existing: [inside, outside], orphans: [], windowComplete: true });
  assert.deepEqual(plan.removals, ["p1"]);
});

test("planSync: não compensado que o banco trocou de id ao compensar mantém a mesma linha (e o que já foi feito nela)", () => {
  const settled = ok({ id: "NEW-ID", date: "2026-10-11T15:00:00Z", description: "PIX ENVIADO FORNECEDOR A", amount: "-300.00", type: "DEBIT", status: "POSTED" });
  const old = existing({
    id: "row-1",
    externalId: "OLD-ID",
    direction: "SAIDA",
    valor: 300,
    date: settled.date,
    occurredAt: new Date("2026-10-11T15:00:00Z"),
    pendingAtBank: true,
    status: "CONCILIADO",
    matchedType: "PAYABLE",
    matchedId: "cp-1",
    observacoes: "pago via app",
  });
  const plan = planSync({ incoming: [settled], existing: [old], orphans: [], windowComplete: true });
  assert.equal(plan.rekeys.length, 1);
  assert.equal(plan.rekeys[0].rowId, "row-1");
  assert.equal(plan.rekeys[0].tx.externalId, "NEW-ID");
  assert.equal(plan.rekeys[0].tx.pendingAtBank, false);
  assert.equal(plan.creates.length, 0); // não vira duplicata
  assert.deepEqual(plan.removals, []); // e a antiga não é apagada
  assert.equal(plan.staleKept, 0);
});

test("planSync: arquivo importado DEPOIS da conexão — linha do arquivo intocada sai, a do banco fica", () => {
  const tx = ok({ id: "b1", date: "2026-10-10T15:00:00Z", description: "PIX", amount: "50.00", type: "CREDIT" });
  const bankRow = existing({
    id: "r1", externalId: "b1", valor: 50, date: tx.date, occurredAt: tx.occurredAt, descricao: "PIX",
    counterpart: null, bankCategory: null, paymentMethod: null,
  });
  const fileRow = existing({ id: "f1", externalId: null, source: "ARQUIVO", valor: 50, date: tx.date, occurredAt: null, descricao: "PIX RECEBIDO" });
  const plan = planSync({ incoming: [tx], existing: [bankRow], orphans: [fileRow] });
  assert.deepEqual(plan.orphanRemovals, ["f1"]);
  assert.equal(plan.merges.length, 0);
  assert.equal(plan.unchanged, 1);
});

test("planSync: arquivo depois da conexão — se a linha do arquivo já foi conciliada e a do banco não, o arquivo assume o id do banco", () => {
  const tx = ok({ id: "b1", date: "2026-10-10T15:00:00Z", description: "PIX", amount: "-50.00", type: "DEBIT" });
  const bankRow = existing({ id: "r1", externalId: "b1", direction: "SAIDA", valor: 50, date: tx.date, occurredAt: tx.occurredAt, descricao: "PIX" });
  const fileRow = existing({ id: "f1", externalId: null, source: "ARQUIVO", direction: "SAIDA", valor: 50, date: tx.date, occurredAt: null, status: "CONCILIADO", matchedType: "PAYABLE", matchedId: "cp-9" });
  const plan = planSync({ incoming: [tx], existing: [bankRow], orphans: [fileRow] });
  assert.deepEqual(plan.merges.map((m) => [m.orphanId, m.deleteRowId, m.tx.externalId]), [["f1", "r1", "b1"]]);
  assert.equal(plan.unchanged, 0); // a linha do banco saiu: não conta
  assert.equal(plan.updates.length, 0);
});

test("planSync: arquivo e banco já mexidos nos dois lados — não mexe e avisa", () => {
  const tx = ok({ id: "b1", date: "2026-10-10T15:00:00Z", amount: "50.00", type: "CREDIT" });
  const bankRow = existing({ id: "r1", externalId: "b1", valor: 50, date: tx.date, occurredAt: tx.occurredAt, status: "CONCILIADO", matchedType: "RECEIVABLE", matchedId: "cr-1" });
  const fileRow = existing({ id: "f1", externalId: null, source: "ARQUIVO", valor: 50, date: tx.date, occurredAt: null, observacoes: "conferido" });
  const plan = planSync({ incoming: [tx], existing: [bankRow], orphans: [fileRow] });
  assert.equal(plan.duplicatesLeft, 1);
  assert.deepEqual([plan.merges.length, plan.orphanRemovals.length, plan.adoptions.length], [0, 0, 0]);
});

test("planSync: data do arquivo 1 dia diferente da do banco só casa quando o par é único", () => {
  const dayBefore = new Date("2026-10-09T03:00:00Z"); // 09/10 em SP
  const mkFile = (id: string) => existing({ id, externalId: null, source: "ARQUIVO", valor: 350, direction: "SAIDA", date: dayBefore, occurredAt: null, createdAt: new Date(`2026-10-0${id.length}T00:00:00Z`) });
  const bank = (id: string) => ok({ id, date: "2026-10-10T15:00:00Z", description: "BOLETO", amount: "-350.00", type: "DEBIT" });
  const unique = planSync({ incoming: [bank("b1")], existing: [], orphans: [mkFile("o1")] });
  assert.deepEqual(unique.adoptions.map((a) => [a.orphanId, a.tx.externalId]), [["o1", "b1"]]);
  const ambiguous = planSync({ incoming: [bank("b1"), bank("b2")], existing: [], orphans: [mkFile("o1")] });
  assert.equal(ambiguous.adoptions.length, 0); // dois lançamentos do banco poderiam ser o mesmo do arquivo: não adivinha
  assert.equal(ambiguous.creates.length, 2);
});

test("planSync: vários iguais no mesmo dia — casa pelo texto mais parecido, não pela ordem", () => {
  const day = ok({ id: "x", date: "2026-10-10T15:00:00Z", amount: "-350.00", type: "DEBIT" }).date;
  const b1 = ok({ id: "b1", date: "2026-10-10T13:00:00Z", description: "PIX ENVIADO", counterpart: "FORNECEDOR BETA LTDA", amount: "-350.00", type: "DEBIT" });
  const b2 = ok({ id: "b2", date: "2026-10-10T17:00:00Z", description: "PIX ENVIADO", counterpart: "FORNECEDOR ALFA LTDA", amount: "-350.00", type: "DEBIT" });
  const file = (id: string, text: string, minute: number) =>
    existing({ id, externalId: null, source: "ARQUIVO", direction: "SAIDA", valor: 350, date: day, occurredAt: null, descricao: text, createdAt: new Date(2026, 9, 5, 10, minute) });
  const plan = planSync({ incoming: [b1, b2], existing: [], orphans: [file("o-alfa", "PIX ENVIADO FORNECEDOR ALFA", 1), file("o-beta", "PIX ENVIADO FORNECEDOR BETA", 2)] });
  const pairs = Object.fromEntries(plan.adoptions.map((a) => [a.orphanId, a.tx.externalId]));
  assert.deepEqual(pairs, { "o-alfa": "b2", "o-beta": "b1" });
});

test("pairTransactions: sentido ou valor diferente nunca casa", () => {
  const base = { dateKey: "2026-10-10", direction: "SAIDA" as const, cents: 5000, text: "", order: 0 };
  assert.equal(pairTransactions([base], [{ ...base, direction: "ENTRADA" }]).length, 0);
  assert.equal(pairTransactions([base], [{ ...base, cents: 5001 }]).length, 0);
  assert.equal(pairTransactions([base], [{ ...base, dateKey: "2026-10-12" }]).length, 0); // 2 dias: longe demais
  assert.equal(pairTransactions([base], [{ ...base }]).length, 1);
});

test("normalizeIncoming: data só com o dia vale o dia informado, sem hora (não cai no dia anterior)", () => {
  for (const date of ["2026-10-12", "2026-10-12T00:00:00Z", "2026-10-12T00:00:00.000Z"]) {
    const tx = ok({ ...pix, date });
    assert.equal(tx.dateKey, "2026-10-12", date);
    assert.equal(tx.date.toISOString(), "2026-10-12T03:00:00.000Z");
    assert.equal(tx.occurredAt, null);
  }
  // Com hora de verdade continua sendo um instante (e 03:00Z = 00:00 em São Paulo).
  const real = ok({ ...pix, date: "2026-10-12T03:00:00.000Z" });
  assert.equal(real.dateKey, "2026-10-12");
  assert.notEqual(real.occurredAt, null);
  assert.equal(ok({ ...pix, date: "2026-10-12T00:00:00-03:00" }).dateKey, "2026-10-12");
});

test("normalizeIncoming: caractere de controle (NUL) é limpo dos textos e recusado no id", () => {
  const tx = ok({ ...pix, description: "PIX\u0000RECEBIDO\u0007 TESTE", counterpart: "A\u0000B" });
  assert.equal(tx.descricao, "PIX RECEBIDO TESTE");
  assert.equal(tx.counterpart, "A B");
  const bad = normalizeIncoming({ ...pix, id: "abc\u0000def" }, NOW);
  assert.equal(bad.ok, false);
});
