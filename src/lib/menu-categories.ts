import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

// Categorias/subcategorias do menu lateral: mesmas para todos os usuários,
// alteradas raramente (só via admin). O layout do portal busca isso em
// TODA navegação de TODA página, então vale cachear — invalidado via
// revalidateTag em qualquer rota que crie/edite/exclua/reordene categoria
// ou subcategoria.
export const MENU_CATEGORIES_TAG = "menu-categories";

export const getMenuCategories = unstable_cache(
  async () =>
    prisma.category.findMany({
      orderBy: { order: "asc" },
      include: { subcategories: { orderBy: { order: "asc" } } },
    }),
  ["menu-categories-all"],
  { tags: [MENU_CATEGORIES_TAG] }
);
