import { prisma } from "@/lib/prisma";
import type { ProductCategory } from "@prisma/client";
import fichasData from "../../scripts/fichas-tecnicas/nord-custeio-produtos.json";

const EMPRESA_KEY = "nord-pizza";

type SheetInsumo = { nome: string; unidade: string; precoCompra: number; rendimento: number; semPreco: boolean };
type SheetIngrediente = { insumo: string; unidade: string; gramatura: number };
type SheetProduto = {
  categoriaAba: string;
  categoria: ProductCategory;
  nome: string;
  precoVenda: number | null;
  taxaIfood: number | null;
  ingredientes: SheetIngrediente[];
};

const DATA = fichasData as { insumos: SheetInsumo[]; produtos: SheetProduto[] };

const CATEGORY_PREFIX: Record<ProductCategory, string> = {
  PIZZA_SALGADA: "PZ",
  PIZZA_DOCE: "PD",
  COMBO: "CB",
  ESFIHA_SALGADA: "ES",
  ESFIHA_DOCE: "ED",
  ACOMPANHAMENTO: "AC",
  BURGER: "BG",
  BEBIDA: "BB",
  DRINK: "DR",
  SOBREMESA: "SB",
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function bestFuzzyMatch(target: string, candidates: Map<string, string>): { key: string; score: number } | null {
  let best: { key: string; score: number } | null = null;
  for (const key of candidates.keys()) {
    const score = similarity(target, key);
    if (!best || score > best.score) best = { key, score };
  }
  return best;
}

export type SyncReport = {
  apply: boolean;
  insumos: {
    total: number;
    created: number;
    updated: number;
    semPreco: string[];
  };
  produtos: {
    total: number;
    created: number;
    updated: number;
  };
  ingredientLinesUnmatched: { produto: string; insumo: string }[];
  ingredientLinesFuzzyMatched: { produto: string; insumo: string; matchedTo: string; score: number }[];
  unidadeConflitos: { produto: string; insumo: string; unidadeReceita: string; unidadeCadastro: string }[];
  precoChanges: { produto: string; campo: "precoVenda" | "taxaIfood"; de: number | null; para: number }[];
  flags: string[];
  errors: string[];
};

export async function runFichasTecnicasSync(apply: boolean): Promise<SyncReport> {
  const empresa = await prisma.empresa.findUnique({ where: { key: EMPRESA_KEY } });
  if (!empresa) throw new Error(`Empresa '${EMPRESA_KEY}' não encontrada.`);

  // Segurança: duas fichas técnicas com a mesma categoria+nome no arquivo de
  // origem se sobrescreveriam silenciosamente durante o sync (a última
  // processada "ganha"). Isso já causou uma corrupção real (uma aba com
  // título errado colidindo com um produto de verdade) — recusa rodar em
  // vez de aplicar silenciosamente.
  const seenKeys = new Map<string, string>();
  for (const p of DATA.produtos) {
    const dupKey = `${p.categoria}::${normalize(p.nome)}`;
    if (seenKeys.has(dupKey)) {
      throw new Error(
        `Dados de origem com fichas técnicas duplicadas para a mesma categoria+nome: '${p.nome}' (${p.categoria}), vindo de '${seenKeys.get(dupKey)}' e '${p.categoriaAba}'. Corrija o arquivo de dados antes de rodar o sync.`
      );
    }
    seenKeys.set(dupKey, p.categoriaAba);
  }

  const report: SyncReport = {
    apply,
    insumos: { total: DATA.insumos.length, created: 0, updated: 0, semPreco: [] },
    produtos: { total: DATA.produtos.length, created: 0, updated: 0 },
    ingredientLinesUnmatched: [],
    ingredientLinesFuzzyMatched: [],
    unidadeConflitos: [],
    precoChanges: [],
    flags: [],
    errors: [],
  };

  // ---------- 1. Insumos -> Ingredient ----------
  const existingIngredients = await prisma.ingredient.findMany({
    where: { empresaId: empresa.id },
    select: { id: true, name: true },
  });
  const ingredientByNorm = new Map<string, string>(); // normalized name -> id
  for (const ing of existingIngredients) ingredientByNorm.set(normalize(ing.name), ing.id);

  for (const insumo of DATA.insumos) {
    if (insumo.semPreco) report.insumos.semPreco.push(insumo.nome);
    const key = normalize(insumo.nome);
    const percentualPerda = insumo.rendimento > 0 ? Math.round((1 / insumo.rendimento - 1) * 10000) / 100 : 0;
    const existingId = ingredientByNorm.get(key);

    if (existingId) {
      report.insumos.updated++;
      if (apply) {
        await prisma.ingredient.update({
          where: { id: existingId },
          data: {
            unidade: insumo.unidade,
            precoAtual: insumo.precoCompra,
            quantidadeEmbalagem: 1,
            percentualPerda,
          },
        });
      }
    } else {
      report.insumos.created++;
      if (apply) {
        const created = await prisma.ingredient.create({
          data: {
            empresaId: empresa.id,
            name: insumo.nome,
            unidade: insumo.unidade,
            precoAtual: insumo.precoCompra,
            quantidadeEmbalagem: 1,
            percentualPerda,
          },
        });
        ingredientByNorm.set(key, created.id);
      } else {
        // reserve the key so later fuzzy-lookups within this dry run see it as known
        ingredientByNorm.set(key, "__pending__");
      }
    }
  }

  // ---------- 2. Produtos + ProductIngredient ----------
  const existingProducts = await prisma.product.findMany({
    where: { empresaId: empresa.id },
    select: { id: true, name: true, category: true, code: true, precoVenda: true, taxaIfood: true },
  });
  const productByKey = new Map<
    string,
    { id: string; code: string; precoVenda: number; taxaIfood: number | null }
  >();
  for (const p of existingProducts)
    productByKey.set(`${p.category}::${normalize(p.name)}`, {
      id: p.id,
      code: p.code,
      precoVenda: p.precoVenda,
      taxaIfood: p.taxaIfood,
    });

  const usedCodes = new Set(existingProducts.map((p) => p.code));
  function nextCode(category: ProductCategory): string {
    const prefix = CATEGORY_PREFIX[category] ?? "PR";
    let n = 1;
    let code = `${prefix}-${String(n).padStart(3, "0")}`;
    while (usedCodes.has(code)) {
      n++;
      code = `${prefix}-${String(n).padStart(3, "0")}`;
    }
    usedCodes.add(code);
    return code;
  }

  // admin user for createdById on new products
  let fallbackUserId: string | null = null;
  if (apply) {
    const admin = await prisma.user.findFirst({
      where: { role: { in: ["ADMINISTRADOR", "GESTOR"] } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    fallbackUserId = admin?.id ?? null;
  }

  for (const produto of DATA.produtos) {
    const key = `${produto.categoria}::${normalize(produto.nome)}`;
    const existing = productByKey.get(key);

    // resolve ingredient lines
    const resolvedLines: { ingredientId: string; quantidadeUsada: number; order: number }[] = [];
    let order = 0;
    for (const line of produto.ingredientes) {
      const lineKey = normalize(line.insumo);
      let ingredientId = ingredientByNorm.get(lineKey) ?? null;
      if (!ingredientId) {
        const fuzzy = bestFuzzyMatch(lineKey, ingredientByNorm);
        if (fuzzy && fuzzy.score >= 0.85) {
          ingredientId = ingredientByNorm.get(fuzzy.key) ?? null;
          report.ingredientLinesFuzzyMatched.push({
            produto: produto.nome,
            insumo: line.insumo,
            matchedTo: fuzzy.key,
            score: Math.round(fuzzy.score * 100) / 100,
          });
        }
      }
      if (!ingredientId || ingredientId === "__pending__") {
        if (!apply) {
          // in dry-run, pending-created insumos count as "would resolve"; only flag true misses
          if (!ingredientId) report.ingredientLinesUnmatched.push({ produto: produto.nome, insumo: line.insumo });
          continue;
        }
        report.ingredientLinesUnmatched.push({ produto: produto.nome, insumo: line.insumo });
        continue;
      }
      resolvedLines.push({ ingredientId, quantidadeUsada: line.gramatura, order: order++ });
    }

    if (existing) {
      report.produtos.updated++;
      const skipIngredientReplace = resolvedLines.length === 0;
      if (skipIngredientReplace) {
        report.flags.push(
          `Produto '${produto.nome}' (${produto.categoria}) já existe no sistema: a receita da planilha veio vazia ou nenhum insumo bateu — os ingredientes já cadastrados NÃO foram alterados.`
        );
      }
      if (produto.precoVenda !== null && Math.abs(produto.precoVenda - existing.precoVenda) > 0.005) {
        report.precoChanges.push({
          produto: produto.nome,
          campo: "precoVenda",
          de: existing.precoVenda,
          para: produto.precoVenda,
        });
      }
      if (
        produto.taxaIfood !== null &&
        Math.abs(produto.taxaIfood - (existing.taxaIfood ?? 0)) > 0.05
      ) {
        report.precoChanges.push({
          produto: produto.nome,
          campo: "taxaIfood",
          de: existing.taxaIfood,
          para: produto.taxaIfood,
        });
      }
      if (apply) {
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            precoVenda: produto.precoVenda ?? undefined,
            taxaIfood: produto.taxaIfood ?? undefined,
          },
        });
        if (!skipIngredientReplace) {
          await prisma.productIngredient.deleteMany({ where: { productId: existing.id } });
          await prisma.productIngredient.createMany({
            data: resolvedLines.map((l) => ({ productId: existing.id, ...l })),
          });
        }
      }
    } else {
      report.produtos.created++;
      if (apply) {
        if (!fallbackUserId) {
          report.errors.push(`Produto '${produto.nome}' não criado: nenhum usuário ADMINISTRADOR/GESTOR encontrado para createdById.`);
          continue;
        }
        const code = nextCode(produto.categoria);
        const created = await prisma.product.create({
          data: {
            empresaId: empresa.id,
            name: produto.nome,
            code,
            category: produto.categoria,
            precoVenda: produto.precoVenda ?? 0,
            taxaIfood: produto.taxaIfood ?? undefined,
            createdById: fallbackUserId,
          },
        });
        productByKey.set(key, {
          id: created.id,
          code,
          precoVenda: produto.precoVenda ?? 0,
          taxaIfood: produto.taxaIfood,
        });
        if (resolvedLines.length > 0) {
          await prisma.productIngredient.createMany({
            data: resolvedLines.map((l) => ({ productId: created.id, ...l })),
          });
        }
      }
    }
  }

  return report;
}
