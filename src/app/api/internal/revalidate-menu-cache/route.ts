import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

// TEMPORARY route. Delete after use.
// A categoria "Loja Nord" foi criada direto no banco via migration de dados
// (não pela API /api/menu), então nunca disparou o revalidateTag que o cache
// de categorias do menu (unstable_cache em src/lib/menu-categories.ts)
// depende para se atualizar. Essa rota força essa revalidação uma vez.
const FIX_TOKEN = "a2e6c9f1b4d7083a6c9e2f5b8d1a4073c6e9f2b5a8";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });
  return NextResponse.json({ ok: true, revalidated: MENU_CATEGORIES_TAG });
}
