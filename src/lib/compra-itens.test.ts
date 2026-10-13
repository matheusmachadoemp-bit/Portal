import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPriceHints,
  closesWithBoleto,
  computeTotals,
  detailPercent,
  diffBreakdown,
  isAboveAgreed,
  itemKey,
  normalizeItems,
  normalizeSupplierKey,
  resolveDivergence,
  round2,
  type NormalizedItem,
} from "@/lib/compra-itens";

// Os números da ilustração aprovada (boleto CP-00231 da Distribuidora Santa Clara).
const exemplo = [
  { kind: "INSUMO", ingredientId: "mussarela", nome: "Mussarela fatiada", quantidade: 30, unidade: "kg", precoCombinado: 38, origemCombinado: "PEDIDO_ESTOQUE", precoCobrado: 41.5 },
  { kind: "INSUMO", ingredientId: "presunto", nome: "Presunto cozido", quantidade: 12, unidade: "kg", precoCombinado: 24.9, origemCombinado: "TABELA_FORNECEDOR", precoCobrado: 24.9 },
  { kind: "INSUMO", ingredientId: "oregano", nome: "Orégano", quantidade: 5, unidade: "pct", precoCombinado: 6.5, origemCombinado: "ULTIMO_PRECO", precoCobrado: 6.5 },
  { kind: "OUTRO", nome: "Caixa de pizza 35 cm", grupo: "Embalagem", quantidade: 200, unidade: "un", precoCombinado: 1.85, origemCombinado: "TABELA_FORNECEDOR", precoCobrado: 1.95 },
  { kind: "AJUSTE", nome: "Frete", precoCobrado: 85 },
];

function ok(raw: unknown): NormalizedItem[] {
  const r = normalizeItems(raw);
  assert.equal(r.ok, true, JSON.stringify(r));
  return (r as { ok: true; items: NormalizedItem[] }).items;
}

test("round2 não deixa ruído de ponto flutuante", () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(2051.3), 2051.3);
});

test("exemplo aprovado: totais, diferença e detalhamento batem com a ilustração", () => {
  const items = ok(exemplo);
  assert.deepEqual(items.map((i) => i.total), [1245, 298.8, 32.5, 390, 85]);
  const t = computeTotals(items);
  assert.equal(t.totalCobrado, 2051.3);
  assert.equal(t.totalCombinado, 1841.3);
  assert.equal(t.totalComparado, 2051.3);
  assert.equal(t.diferenca, 210);
  assert.equal(t.diferencaPct, 11.4);
  assert.equal(isAboveAgreed(t), true);
  assert.deepEqual(diffBreakdown(items), { precoAcima: 125, precoAbaixo: 0, ajustes: 85 });
  assert.equal(closesWithBoleto(t.totalCobrado, 2051.3), true);
  assert.equal(closesWithBoleto(t.totalCobrado, 2000), false);
  assert.equal(detailPercent(t.totalCobrado, 2051.3), 100);
  assert.equal(detailPercent(1025.65, 2051.3), 50);
  assert.equal(detailPercent(3000, 2051.3), 100); // nunca passa de 100
});

test("frete sem combinado conta como R$ 0,00 combinado (origem “não combinado”); desconto pode ser negativo", () => {
  const [frete, desconto] = ok([
    { kind: "AJUSTE", nome: "Frete", precoCobrado: "85,00" },
    { kind: "AJUSTE", nome: "Desconto", precoCobrado: -30 },
  ]);
  assert.equal(frete.precoCombinado, 0);
  assert.equal(frete.origemCombinado, "NAO_COMBINADO");
  assert.equal(frete.quantidade, 1);
  assert.equal(desconto.total, -30);
  assert.equal(computeTotals([frete, desconto]).totalCobrado, 55);
});

test("item sem preço combinado fica fora da comparação (mas entra no total cobrado)", () => {
  const items = ok([
    { kind: "OUTRO", nome: "Detergente", grupo: "Limpeza", quantidade: 4, unidade: "un", precoCobrado: 12.5 },
    { kind: "INSUMO", ingredientId: "x", nome: "Tomate", quantidade: 10, unidade: "kg", precoCombinado: 3, precoCobrado: 3 },
  ]);
  assert.equal(items[0].precoCombinado, null);
  assert.equal(items[0].origemCombinado, null);
  const t = computeTotals(items);
  assert.equal(t.totalCobrado, 80);
  assert.equal(t.totalCombinado, 30);
  assert.equal(t.totalComparado, 30);
  assert.equal(t.diferenca, 0);
  assert.equal(isAboveAgreed(t), false);
});

test("abaixo do combinado: diferença negativa, nada a decidir", () => {
  const items = ok([{ kind: "INSUMO", ingredientId: "x", nome: "Tomate", quantidade: 100, unidade: "kg", precoCombinado: 3, precoCobrado: 2.78 }]);
  const t = computeTotals(items);
  assert.equal(t.diferenca, -22);
  assert.equal(isAboveAgreed(t), false);
  assert.deepEqual(diffBreakdown(items), { precoAcima: 0, precoAbaixo: 22, ajustes: 0 });
});

test("até 5 centavos de diferença total não conta como acima do combinado", () => {
  assert.equal(isAboveAgreed({ diferenca: 0.05 }), false);
  assert.equal(isAboveAgreed({ diferenca: 0.06 }), true);
});

test("normalizeItems recusa itens inválidos, com o motivo", () => {
  const bad = (raw: unknown) => {
    const r = normalizeItems(raw);
    assert.equal(r.ok, false);
    return (r as { ok: false; error: string }).error;
  };
  const base = exemplo[0];
  assert.match(bad([]), /pelo menos um item/);
  assert.match(bad("x"), /pelo menos um item/);
  assert.match(bad(Array.from({ length: 201 }, () => base)), /Itens demais/);
  assert.match(bad([{ ...base, kind: "OUTRA" }]), /tipo de item/);
  assert.match(bad([{ ...base, nome: "  " }]), /nome do produto/);
  assert.match(bad([{ ...base, ingredientId: "" }]), /escolha o insumo/);
  assert.match(bad([{ ...base, quantidade: 0 }]), /quantidade/);
  assert.match(bad([{ ...base, quantidade: "abc" }]), /quantidade/);
  assert.match(bad([{ ...base, quantidade: 1e9 }]), /quantidade/);
  assert.match(bad([{ ...base, unidade: "" }]), /unidade/);
  assert.match(bad([{ ...base, precoCobrado: undefined }]), /valor cobrado/);
  assert.match(bad([{ ...base, precoCobrado: -1 }]), /negativo/);
  assert.match(bad([{ ...base, precoCombinado: "xx" }]), /combinado inválido/);
  assert.match(bad([{ ...base, precoCombinado: -3 }]), /combinado inválido/);
  assert.match(bad([null]), /inválido/);
});

test("normalizeItems limpa texto, limita tamanhos e ignora origem desconhecida", () => {
  const [item] = ok([{ kind: "OUTRO", nome: "  Caixa\u0000   de  pizza ".repeat(30), grupo: "x".repeat(100), quantidade: "2,5", unidade: " un ", precoCombinado: "1,85", origemCombinado: "QUALQUER", precoCobrado: "1,95" }]);
  assert.equal(item.nome.length <= 120, true);
  assert.equal(item.nome.includes("\u0000"), false);
  assert.equal(item.grupo?.length, 40);
  assert.equal(item.quantidade, 2.5);
  assert.equal(item.unidade, "un");
  assert.equal(item.origemCombinado, "MANUAL");
  assert.equal(item.total, round2(2.5 * 1.95));
  // OUTRO sem grupo cai em “Outros”
  assert.equal(ok([{ kind: "OUTRO", nome: "x", quantidade: 1, unidade: "un", precoCobrado: 1 }])[0].grupo, "Outros");
  // grupo só existe em OUTRO
  assert.equal(ok([{ ...exemplo[0], grupo: "Embalagem" }])[0].grupo, null);
});

test("resolveDivergence: sem diferença acima do combinado não há decisão", () => {
  const r = resolveDivergence(false, { acao: "CONTESTAR" }, null, 0);
  assert.deepEqual(r, { ok: true, decision: { status: "SEM_DIVERGENCIA", motivo: null, observacao: null, valor: 0 } });
});

test("resolveDivergence: acima do combinado exige contestar ou aceitar com motivo (e guarda a diferença)", () => {
  const nada = resolveDivergence(true, null, null, 210);
  assert.equal(nada.ok, false);
  const contest = resolveDivergence(true, { acao: "CONTESTAR", observacao: "  cobrar R$ 105 de volta " }, null, 210);
  assert.deepEqual(contest, { ok: true, decision: { status: "EM_CONTESTACAO", motivo: null, observacao: "cobrar R$ 105 de volta", valor: 210 } });
  const aceita = resolveDivergence(true, { acao: "ACEITAR", motivo: "Frete não combinado" }, null, 85);
  assert.deepEqual(aceita, { ok: true, decision: { status: "ACEITA", motivo: "Frete não combinado", observacao: null, valor: 85 } });
  assert.equal(resolveDivergence(true, { acao: "ACEITAR", motivo: "inventado" }, null, 10).ok, false);
  assert.equal(resolveDivergence(true, { acao: "ACEITAR" }, null, 10).ok, false);
  assert.equal(resolveDivergence(true, { acao: "ACEITAR", motivo: "Outro" }, null, 10).ok, false); // “Outro” pede explicação
  assert.equal(resolveDivergence(true, { acao: "ACEITAR", motivo: "Outro", observacao: "acordo verbal" }, null, 10).ok, true);
});

test("resolveDivergence: sem nova escolha mantém a gravada, mas só enquanto a diferença não cresceu", () => {
  const gravada = { status: "ACEITA" as const, motivo: "Reajuste do fornecedor", observacao: null, valor: 35 };
  const igual = resolveDivergence(true, undefined, gravada, 35);
  assert.deepEqual(igual, { ok: true, decision: { status: "ACEITA", motivo: "Reajuste do fornecedor", observacao: null, valor: 35 } });
  assert.equal(resolveDivergence(true, undefined, gravada, 20).ok, true); // diminuiu: continua valendo
  assert.equal(resolveDivergence(true, undefined, gravada, 35.05).ok, true); // dentro da tolerância
  const cresceu = resolveDivergence(true, undefined, gravada, 620);
  assert.equal(cresceu.ok, false);
  assert.match((cresceu as { ok: false; error: string }).error, /aumentou \(de R\$ 35,00 para R\$ 620,00\)/);
  // estava sem divergência e agora passou a ter: precisa escolher
  assert.equal(resolveDivergence(true, undefined, { status: "SEM_DIVERGENCIA", motivo: null, observacao: null, valor: 0 }, 50).ok, false);
});

test("itemKey: insumo pelo id; outros itens pelo nome sem acento/caixa + unidade", () => {
  assert.equal(itemKey({ kind: "INSUMO", ingredientId: "abc", nome: "Qualquer", unidade: "kg" }), "i:abc|kg");
  // o mesmo insumo em outra unidade é outro preço de referência
  assert.notEqual(itemKey({ kind: "INSUMO", ingredientId: "abc", nome: "x", unidade: "kg" }), itemKey({ kind: "INSUMO", ingredientId: "abc", nome: "x", unidade: "cx" }));
  const a = itemKey({ kind: "OUTRO", ingredientId: null, nome: "Caixa de Pizza  35 cm", unidade: "UN" });
  const b = itemKey({ kind: "OUTRO", ingredientId: null, nome: "caixa de pizza 35 cm", unidade: "un" });
  assert.equal(a, b);
  assert.notEqual(a, itemKey({ kind: "OUTRO", ingredientId: null, nome: "caixa de pizza 35 cm", unidade: "cx" }));
});

test("buildPriceHints: vale o item mais recente; em contestação a referência é o combinado", () => {
  const item = (over: Record<string, unknown>) => ({
    kind: "INSUMO" as const, ingredientId: "m", nome: "Mussarela", grupo: null, quantidade: 10, unidade: "kg",
    precoCombinado: 38, origemCombinado: "TABELA_FORNECEDOR" as const, precoCobrado: 41.5, ...over,
  });
  const recente = { id: "2", dataCompra: new Date("2026-10-10T03:00:00Z"), divergenciaStatus: "EM_CONTESTACAO" as const, items: [item({}), { ...item({ kind: "AJUSTE", ingredientId: null, nome: "Frete" }) }] };
  const antiga = { id: "1", dataCompra: new Date("2026-09-10T03:00:00Z"), divergenciaStatus: "SEM_DIVERGENCIA" as const, items: [item({ precoCobrado: 39 }), item({ ingredientId: "p", nome: "Presunto", precoCobrado: 24.9 })] };
  const hints = buildPriceHints([recente, antiga]);
  assert.equal(hints["i:m|kg"].preco, 38); // contestada: referência = combinado
  assert.equal(hints["i:p|kg"].preco, 24.9);
  assert.equal(hints["i:m|kg"].origem, "ULTIMO_PRECO");
  assert.equal(Object.keys(hints).length, 2); // ajuste (frete) não entra
  const paga = buildPriceHints([{ ...recente, divergenciaStatus: "ACEITA" }, antiga]);
  assert.equal(paga["i:m|kg"].preco, 41.5); // aceita/sem divergência: o que foi pago
});

test("buildPriceHints: item de preço zero (brinde) não vira referência — vale a compra anterior", () => {
  const item = (preco: number) => ({
    kind: "INSUMO" as const, ingredientId: "m", nome: "Mussarela", grupo: null, quantidade: 1, unidade: "kg",
    precoCombinado: null, origemCombinado: null, precoCobrado: preco,
  });
  const recente = { id: "2", dataCompra: new Date("2026-10-10T03:00:00Z"), divergenciaStatus: "SEM_DIVERGENCIA" as const, items: [item(0)] };
  const antiga = { id: "1", dataCompra: new Date("2026-09-10T03:00:00Z"), divergenciaStatus: "SEM_DIVERGENCIA" as const, items: [item(39)] };
  assert.equal(buildPriceHints([recente, antiga])["i:m|kg"].preco, 39);
});

test("arredondamento: 12 itens a preço IGUAL ao combinado não geram diferença (meio centavo por item)", () => {
  const precos = [4.99, 8.99, 12.99, 6.49, 3.99, 9.99, 7.49, 5.99, 14.99, 2.99, 11.49, 15.99];
  const items = ok(precos.map((p, i) => ({ kind: "OUTRO", nome: `Item ${i}`, quantidade: 2.5, unidade: "kg", precoCombinado: p, precoCobrado: p })));
  const t = computeTotals(items);
  assert.equal(t.diferenca, 0);
  assert.equal(isAboveAgreed(t), false);
  assert.deepEqual(diffBreakdown(items), { precoAcima: 0, precoAbaixo: 0, ajustes: 0 });
  const many = ok(Array.from({ length: 40 }, (_, i) => ({ kind: "OUTRO", nome: `X${i}`, quantidade: 1.5, unidade: "kg", precoCombinado: 0.67, precoCobrado: 0.67 })));
  assert.equal(computeTotals(many).diferenca, 0);
});

test("frete/desconto sozinhos (nenhum produto com combinado) não geram “acima do combinado”", () => {
  const items = ok([
    { kind: "OUTRO", nome: "Detergente", grupo: "Limpeza", quantidade: 4, unidade: "un", precoCobrado: 12.5 },
    { kind: "AJUSTE", nome: "Frete", precoCobrado: 20 },
  ]);
  const t = computeTotals(items);
  assert.equal(t.totalCobrado, 70);
  assert.deepEqual([t.totalCombinado, t.totalComparado, t.diferenca], [0, 0, 0]);
  assert.equal(isAboveAgreed(t), false);
  assert.deepEqual(diffBreakdown(items), { precoAcima: 0, precoAbaixo: 0, ajustes: 0 });
});

test("desconto abaixo do combinado aparece como ajuste negativo", () => {
  const items = ok([
    { kind: "INSUMO", ingredientId: "m", nome: "Mussarela", quantidade: 30, unidade: "kg", precoCombinado: 38, precoCobrado: 41.5 },
    { kind: "AJUSTE", nome: "Desconto", precoCobrado: -30 },
  ]);
  assert.equal(computeTotals(items).diferenca, 75);
  assert.deepEqual(diffBreakdown(items), { precoAcima: 105, precoAbaixo: 0, ajustes: -30 });
});

test("números digitados: só dígitos com vírgula/ponto (nada de 0x10, 1e3 ou separador de milhar)", () => {
  const bad = (q: unknown) => normalizeItems([{ kind: "OUTRO", nome: "x", quantidade: q, unidade: "un", precoCobrado: 1 }]).ok;
  assert.equal(bad("0x10"), false);
  assert.equal(bad("1e3"), false);
  assert.equal(bad("1.234,56"), false);
  assert.equal(bad("12"), true);
  assert.equal(bad("12,5"), true);
  assert.equal(bad(" 12.5 "), true);
  assert.equal(bad(".5"), true);
  assert.equal(bad("-1"), false); // quantidade negativa
});

test("total de um item grande demais é recusado (erro de digitação)", () => {
  const r = normalizeItems([{ kind: "OUTRO", nome: "x", quantidade: 5_000_000, unidade: "un", precoCobrado: 5_000_000 }]);
  assert.equal(r.ok, false);
  assert.match((r as { ok: false; error: string }).error, /grande demais/);
});

test("detailPercent: 100% só quando fecha de verdade", () => {
  assert.equal(detailPercent(1992, 2000), 99);
  assert.equal(detailPercent(2000, 2000), 100);
  assert.equal(detailPercent(2000.04, 2000), 100); // dentro dos 5 centavos
  assert.equal(detailPercent(3000, 2000), 100);
  assert.equal(detailPercent(0, 2000), 0);
  assert.equal(detailPercent(500, 0), 0);
});

test("normalizeSupplierKey: sem acento, caixa e espaços; não trata % nem _ como curinga", () => {
  assert.equal(normalizeSupplierKey("  Padaria   Súl "), "padaria sul");
  assert.equal(normalizeSupplierKey("PADARIA SUL"), "padaria sul");
  assert.equal(normalizeSupplierKey("%"), "%");
  assert.notEqual(normalizeSupplierKey("%"), normalizeSupplierKey("Moinho Sul"));
});
