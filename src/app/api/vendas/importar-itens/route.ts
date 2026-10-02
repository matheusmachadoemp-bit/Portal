import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { buildImportFallbackBucket, computeImportFallbackStats } from "@/lib/import-fallback";
import { parseExcelDateCode, readWorkbookRows } from "@/lib/xlsx-import";
import { spStartOfDay } from "@/lib/timezone";

const INSERT_CHUNK_SIZE = 1000;

function normalizeText(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// `periodFrom`/`periodTo` são comparados em outros módulos (ex. `quantidadeVendidaPorProdutoNoPeriodo`
// em @/lib/cmv-server.ts e `computeItensVendidosRows` em @/lib/faturamento-analytics.ts, usados por
// CMV e pela Curva ABC de Vendas) contra o período selecionado no dashboard, sempre ancorado em
// meia-noite de São Paulo (`resolvePeriod`/`spStartOfDay`, ver @/lib/periods.ts). Por isso ancora em
// meia-noite de SÃO PAULO aqui também, não em meia-noite UTC (Date.UTC direto) — mesma causa raiz e
// mesmo remédio já aplicados na importação de colaboradores/ponto do RH (ver
// rh/employees/import/route.ts e rh/time-entries/import/route.ts): `new Date(Date.UTC(y, m-1, d))`
// fica 3h ANTES da meia-noite de SP do mesmo dia, o que faz o período importado ficar fora do
// `gte`/`lte` calculado pelos módulos acima na última(s) hora(s) do dia final do período.
//
// `validOrNull` existe porque `spStartOfDay` remonta a string e reparsa via `new
// Date("YYYY-MM-DDT00:00:00-03:00")` — diferente de `Date.UTC` com números (que sempre normaliza,
// nunca dá Date inválido), mês/dia fora do intervalo sintático (ex. mês "13") faz essa string virar
// `Invalid Date` — e um `Invalid Date` é truthy em JS, então sem essa checagem explícita uma data
// malformada passaria pelo `if (!periodFrom)` abaixo, chegaria inválida no Prisma e estouraria um
// erro não tratado (achado do Teulis na correção original do RH, ver rh/employees/import/route.ts).
function validOrNull(d: Date): Date | null {
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBrDate(raw: string | number): Date | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (typeof raw === "number") {
    const parsed = parseExcelDateCode(raw);
    if (!parsed) return null;
    return validOrNull(spStartOfDay(`${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`));
  }
  const s = String(raw).trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (!br) return null;
  const year = br[3].length === 2 ? Number(`20${br[3]}`) : Number(br[3]);
  return validOrNull(spStartOfDay(`${year}-${pad(Number(br[2]))}-${pad(Number(br[1]))}`));
}

type CategoryChild = { name: string; qty: number; valor: number };
type Category = { name: string; qty: number; valor: number; children: CategoryChild[] };

/**
 * O relatório "Itens e Opções" do Saipos mistura, na mesma coluna e com o
 * mesmo prefixo "- ", produtos vendidos de verdade e opções/modificadores
 * gratuitos (ex.: "sem borda", "com açúcar"). Regra usada para separar:
 *
 * - Se a categoria tem um único filho cujo valor/quantidade batem
 *   exatamente com o total da categoria (ex.: "Pizza Grande Salgada - 8
 *   Fatias" = "Pizza Salgada"), esse filho é só um "invólucro" — os itens
 *   de verdade são os filhos SEGUINTES a ele (os sabores/variações).
 * - Senão, cada filho da categoria já é um produto distinto (ex.: cada
 *   sabor de esfiha).
 * - Em qualquer caso, filhos com valor R$ 0 são opções gratuitas
 *   (modificadores) e são ignorados — não são vendas.
 */
function buildItems(categories: Category[]): { nome: string; quantidade: number; faturamento: number }[] {
  const items: { nome: string; quantidade: number; faturamento: number }[] = [];
  for (const cat of categories) {
    if (cat.children.length === 0) {
      items.push({ nome: cat.name, quantidade: cat.qty, faturamento: cat.valor });
      continue;
    }
    const wrapperIdx = cat.children.findIndex(
      (c) => Math.abs(c.qty - cat.qty) < 0.01 && Math.abs(c.valor - cat.valor) < 0.01
    );
    if (wrapperIdx !== -1) {
      const wrapper = cat.children[wrapperIdx];
      const rest = cat.children.slice(wrapperIdx + 1).filter((c) => c.valor > 0);
      if (rest.length === 0) {
        items.push({ nome: `${cat.name} - ${wrapper.name}`, quantidade: wrapper.qty, faturamento: wrapper.valor });
      } else {
        for (const c of rest) items.push({ nome: `${cat.name} - ${c.name}`, quantidade: c.qty, faturamento: c.valor });
      }
    } else {
      for (const c of cat.children.filter((c) => c.valor > 0)) {
        items.push({ nome: `${cat.name} - ${c.name}`, quantidade: c.qty, faturamento: c.valor });
      }
    }
  }
  return items;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "vendas", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite importar itens vendidos." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível importar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: (string | number)[][];
  try {
    rows = await readWorkbookRows(buffer);
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o arquivo. Confira se é um .xlsx válido." }, { status: 400 });
  }

  // O Saipos já exportou esse relatório de duas formas diferentes: uma tabela só ("Itens e
  // Opções", tudo junto) e, no formato atual (confirmado contra um arquivo real de setembro/2026),
  // duas tabelas separadas na mesma aba — "Itens" (produtos vendidos, cada linha já com
  // quantidade/valor reais, sem hierarquia) seguida de "Opções" (frequência de escolha de
  // modificadores/sabores — ex.: "Gostaria de Borda Recheada?" — cujo percentual soma ~100% POR
  // GRUPO, não é receita de produto; somar junto contaria a mesma venda várias vezes). Aceita as
  // duas variações do cabeçalho e, quando existir uma segunda tabela "Opções", para de ler ali.
  const headerIdx = rows.findIndex((r) => {
    const t = normalizeText(String(r[0]));
    return t === "itens e opcoes" || t === "itens";
  });
  if (headerIdx === -1 || headerIdx < 1) {
    return NextResponse.json(
      {
        error:
          'Cabeçalho não reconhecido. Envie o relatório "Itens Vendidos" exportado do Saipos.',
      },
      { status: 400 }
    );
  }

  const opcoesHeaderIdx = rows.findIndex(
    (r, idx) => idx > headerIdx && normalizeText(String(r[0])) === "opcoes"
  );
  const dataEndIdx = opcoesHeaderIdx === -1 ? rows.length : opcoesHeaderIdx;

  const labelIdx = rows.findIndex((r) => normalizeText(String(r[0])).startsWith("data inicial"));
  const dateRow = labelIdx !== -1 ? rows[labelIdx + 1] : undefined;
  const periodFrom = dateRow ? parseBrDate(dateRow[0]) : null;
  const periodTo = dateRow ? parseBrDate(dateRow[1]) : null;
  if (!periodFrom || !periodTo) {
    return NextResponse.json({ error: "Não foi possível identificar o período (Data Inicial/Data Final) do relatório." }, { status: 400 });
  }

  const dataRows = rows.slice(headerIdx + 1, dataEndIdx).filter((r) => String(r[0] ?? "").trim() !== "");

  const categories: Category[] = [];
  let current: Category | null = null;
  for (const r of dataRows) {
    const name = String(r[0]).trim();
    const isChild = name.startsWith("-");
    const qty = Number(r[1]) || 0;
    const valor = Number(r[2]) || 0;
    if (!isChild) {
      current = { name, qty, valor, children: [] };
      categories.push(current);
    } else if (current) {
      current.children.push({ name: name.replace(/^-\s*/, "").trim(), qty, valor });
    }
  }

  if (categories.length === 0) {
    return NextResponse.json({ error: "Nenhum item encontrado no arquivo." }, { status: 400 });
  }

  const parsedItems = buildItems(categories).filter((i) => i.nome && i.faturamento !== 0);

  const products = await prisma.product.findMany({
    where: { empresaId: empresa.id },
    select: { id: true, name: true },
  });
  const productByName = new Map(products.map((p) => [normalizeText(p.name), p.id]));

  const insertRows = parsedItems.map((item) => ({
    id: randomUUID(),
    empresaId: empresa.id,
    productId: productByName.get(normalizeText(item.nome)) ?? null,
    nome: item.nome,
    quantidade: item.quantidade,
    faturamento: item.faturamento,
    periodFrom,
    periodTo,
  }));

  await prisma.importedSaleItem.deleteMany({
    where: { empresaId: empresa.id, periodFrom, periodTo },
  });

  for (let i = 0; i < insertRows.length; i += INSERT_CHUNK_SIZE) {
    await prisma.importedSaleItem.createMany({ data: insertRows.slice(i, i + INSERT_CHUNK_SIZE) });
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: empresa.id,
      action: "IMPORT",
      entityType: "ImportedSaleItem",
      entityId: file.name,
      after: JSON.stringify({ fileName: file.name, itens: insertRows.length, periodFrom, periodTo }),
    },
  });

  const faturamentoTotal = insertRows.reduce((sum, r) => sum + r.faturamento, 0);
  const comProduto = insertRows.filter((r) => r.productId).length;
  // Itens cujo nome não bateu com nenhum produto já cadastrado em Ficha Técnica (productId
  // null) — não entram no cálculo de margem e não aparecem separados por produto de verdade.
  const semProduto = insertRows.length - comProduto;
  const semProdutoStats = computeImportFallbackStats(semProduto, insertRows.length);
  const produtoWarning = buildImportFallbackBucket(
    "produto",
    semProdutoStats,
    `${semProdutoStats.percentLabel} dos itens importados (${semProduto} de ${insertRows.length}) não bateram com nenhum produto já cadastrado em Ficha Técnica e ficaram sem produto vinculado (não entram no cálculo de margem) — confira se o nome do item no arquivo é igual ao nome cadastrado, ou cadastre o produto que falta.`
  );

  return NextResponse.json({
    itens: insertRows.length,
    faturamentoTotal,
    comProduto,
    periodFrom: periodFrom.toISOString(),
    periodTo: periodTo.toISOString(),
    fallbackWarnings: [produtoWarning],
  });
}
