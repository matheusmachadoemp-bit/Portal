import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import categoryMap from "../../../../../scripts/fichas-tecnicas-insumo-categorias.json";

// TEMPORARY, ONE-OFF ROUTE. Cria (se ainda não existirem) as categorias
// "Itens Pizzaria", "Itens Hamburgueria", "Itens Bar" e "Bebidas" (modelo
// StockCategory, já usado pelo módulo Estoque > Categorias) e atribui a
// categoria certa aos insumos importados da planilha, com base em quais
// fichas técnicas usam cada insumo (não é um chute por nome). Insumos de
// uso ambíguo/cruzado (ex.: farinha, sal, óleo) ficam sem categoria de
// propósito, para revisão manual.
//
// GET roda em dry-run; GET ?apply=1 aplica de fato. Protegida por sessão
// ADMINISTRADOR/GESTOR. Apagar rota + o JSON de mapeamento depois de usar.

const CATEGORY_DEFS: Record<string, { key: string; color: string; icon: string; order: number }> = {
  "Itens Pizzaria": { key: "itens-pizzaria", color: "#EF4444", icon: "Pizza", order: 20 },
  "Itens Hamburgueria": { key: "itens-hamburgueria", color: "#F59E0B", icon: "Hamburger", order: 21 },
  "Itens Bar": { key: "itens-bar", color: "#a855f7", icon: "Martini", order: 22 },
  Bebidas: { key: "bebidas", color: "#2952E3", icon: "CupSoda", order: 23 },
};

const NAME_TO_CATEGORY = categoryMap as Record<string, string>;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const apply = searchParams.get("apply") === "1";

  const categoryIdByLabel = new Map<string, string>();
  for (const [label, def] of Object.entries(CATEGORY_DEFS)) {
    const existing = await prisma.stockCategory.findUnique({ where: { key: def.key } });
    if (existing) {
      categoryIdByLabel.set(label, existing.id);
      continue;
    }
    if (apply) {
      const created = await prisma.stockCategory.create({
        data: { key: def.key, name: label, color: def.color, icon: def.icon, order: def.order },
      });
      categoryIdByLabel.set(label, created.id);
    }
  }

  const ingredients = await prisma.ingredient.findMany({
    select: { id: true, name: true, categoryId: true },
  });
  const byNormName = new Map(ingredients.map((i) => [normalize(i.name), i]));

  const updates: { nome: string; categoria: string }[] = [];
  const jaCategorizados: { nome: string; categoriaAtual: string | null }[] = [];
  const naoEncontrados: string[] = [];

  for (const [nome, categoriaLabel] of Object.entries(NAME_TO_CATEGORY)) {
    const ing = byNormName.get(normalize(nome));
    if (!ing) {
      naoEncontrados.push(nome);
      continue;
    }
    if (ing.categoryId) {
      jaCategorizados.push({ nome, categoriaAtual: ing.categoryId });
      continue;
    }
    updates.push({ nome, categoria: categoriaLabel });
    if (apply) {
      const categoryId = categoryIdByLabel.get(categoriaLabel);
      if (categoryId) {
        await prisma.ingredient.update({ where: { id: ing.id }, data: { categoryId } });
      }
    }
  }

  return NextResponse.json({
    apply,
    categoriasCriadas: [...categoryIdByLabel.keys()],
    insumosAtualizados: updates.length,
    insumosJaTinhamCategoria: jaCategorizados.length,
    insumosNaoEncontrados: naoEncontrados,
    detalheAtualizados: updates,
  });
}
