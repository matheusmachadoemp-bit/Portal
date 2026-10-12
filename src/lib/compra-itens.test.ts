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
  const r = resolveDivergence(false, { acao: "CONTESTAR" }, null);
  assert.deepEqual(r, { ok: true, decision: { status: "SEM_DIVERGENCIA", motivo: null, observacao: null } });
});

test("resolveDivergence: acima do combinado exige contestar ou aceitar com motivo", () => {
  const nada = resolveDivergence(true, null, null);
  assert.equal(nada.ok, false);
  const contest = resolveDivergence(true, { acao: "CONTESTAR", observacao: "  cobrar R$ 105 de volta " }, null);
  assert.deepEqual(contest, { ok: true, decision: { status: "EM_CONTESTACAO", motivo: null, observacao: "cobrar R$ 105 de volta" } });
  const aceita = resolveDivergence(true, { acao: "ACEITAR", motivo: "Frete não combinado" }, null);
  assert.deepEqual(aceita, { ok: true, decision: { status: "ACEITA", motivo: "Frete não combinado", observacao: null } });
  assert.equal(resolveDivergence(true, { acao: "ACEITAR", motivo: "inventado" }, null).ok, false);
  assert.equal(resolveDivergence(true, { acao: "ACEITAR" }, null).ok, false);
  assert.equal(resolveDivergence(true, { acao: "ACEITAR", motivo: "Outro" }, null).ok, false); // “Outro” pede explicação
  assert.equal(resolveDivergence(true, { acao: "ACEITAR", motivo: "Outro", observacao: "acordo verbal" }, null).ok, true);
});

test("resolveDivergence: ao editar sem nova escolha, mantém a que já estava gravada", () => {
  const kept = resolveDivergence(true, undefined, { status: "EM_CONTESTACAO", motivo: null, observacao: "x" });
  assert.deepEqual(kept, { ok: true, decision: { status: "EM_CONTESTACAO", motivo: null, observacao: "x" } });
  // estava sem divergência e agora passou a ter: precisa escolher
  assert.equal(resolveDivergence(true, undefined, { status: "SEM_DIVERGENCIA", motivo: null, observacao: null }).ok, false);
});

test("itemKey: insumo pelo id; outros itens pelo nome sem acento/caixa + unidade", () => {
  assert.equal(itemKey({ kind: "INSUMO", ingredientId: "abc", nome: "Qualquer", unidade: "kg" }), "i:abc");
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
  assert.equal(hints["i:m"].preco, 38); // contestada: referência = combinado
  assert.equal(hints["i:p"].preco, 24.9);
  assert.equal(hints["i:m"].origem, "ULTIMO_PRECO");
  assert.equal(Object.keys(hints).length, 2); // ajuste (frete) não entra
  const paga = buildPriceHints([{ ...recente, divergenciaStatus: "ACEITA" }, antiga]);
  assert.equal(paga["i:m"].preco, 41.5); // aceita/sem divergência: o que foi pago
});
