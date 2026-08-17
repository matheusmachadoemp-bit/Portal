import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

const DEFAULT_ORDER = [
  "inicio",
  "vendas",
  "marketing",
  "metas",
  "rh",
  "administrativo",
  "ficha-tecnica",
  "configuracoes",
  "usuarios",
];

const DEFAULT_SUB_ORDER: Record<string, string[]> = {
  metas: ["gerencia", "salao", "cozinha", "delivery"],
  rh: [
    "colaboradores",
    "financeiro",
    "ponto-eletronico",
    "ocorrencias",
    "ferias",
    "uniformes",
    "documentos",
    "dashboard",
  ],
  administrativo: ["senhas", "cursos", "cartilhas", "logo", "arquivos"],
  "ficha-tecnica": [
    "pizzas-salgadas",
    "pizzas-doces",
    "combos",
    "esfihas-salgadas",
    "esfihas-doces",
    "acompanhamentos",
    "burgers",
    "bebidas",
    "drinks",
    "insumos",
  ],
};

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  for (let i = 0; i < DEFAULT_ORDER.length; i++) {
    await prisma.category.updateMany({ where: { key: DEFAULT_ORDER[i] }, data: { order: i } });
  }

  for (const [catKey, subKeys] of Object.entries(DEFAULT_SUB_ORDER)) {
    const category = await prisma.category.findUnique({ where: { key: catKey } });
    if (!category) continue;
    for (let i = 0; i < subKeys.length; i++) {
      await prisma.subcategory.updateMany({
        where: { key: subKeys[i], categoryId: category.id },
        data: { order: i },
      });
    }
  }

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });
  return NextResponse.json({ ok: true });
}
