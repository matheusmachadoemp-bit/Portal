import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Trava barata contra a volta do defeito: as colunas de DIA do Financeiro e das Compras do Estoque são
// gravadas SEMPRE por parseDayInput (@/lib/timezone), nunca por new Date(body.xxx) (meia-noite UTC = 21h do
// dia anterior em São Paulo). Roda a partir da raiz do repositório (npm test).
const ROTAS = [
  "src/app/api/financeiro/pagar/route.ts",
  "src/app/api/financeiro/pagar/[id]/route.ts",
  "src/app/api/financeiro/receber/route.ts",
  "src/app/api/financeiro/receber/[id]/route.ts",
  "src/app/api/financeiro/recorrentes/route.ts",
  "src/app/api/estoque/compras/route.ts",
  "src/app/api/estoque/compras/[id]/route.ts",
];
const TELAS_DIA_DE_HOJE = [
  "src/app/portal/estoque/compras/compras-client.tsx",
  "src/app/portal/estoque/recebimento/novo/novo-pedido-client.tsx",
];
const ler = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), "utf8");

for (const rota of ROTAS) {
  test(`${rota} grava dias com parseDayInput`, () => {
    const src = ler(rota);
    assert.doesNotMatch(src, /new Date\([^)]*\bbody\b/, "new Date(body...) volta a gravar meia-noite UTC");
    assert.match(src, /parseDayInput/);
  });
}

for (const tela of TELAS_DIA_DE_HOJE) {
  test(`${tela} usa o dia de hoje de São Paulo (spDateKey)`, () => {
    const src = ler(tela);
    assert.doesNotMatch(src, /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/, "dia UTC: das 21h às 23h59 de SP vem com amanhã");
    assert.match(src, /spDateKey\(\)/);
  });
}
