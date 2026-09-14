import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

// Categorias/subcategorias do menu lateral: mesmas para todos os usuários,
// alteradas raramente (só via admin). O layout do portal busca isso em
// TODA navegação de TODA página, então vale cachear — invalidado via
// revalidateTag em qualquer rota que crie/edite/exclua/reordene categoria
// ou subcategoria.
//
// `revalidate` é uma rede de segurança: uma migração que altera a tabela
// Category direto via SQL (ex.: 20260914130000_tarefas_subcategoria_propria,
// que adicionou a coluna `linked`) não passa por nenhuma rota da aplicação —
// nada chama revalidateTag — então esse cache (sem TTL antes) continuava
// servindo o formato de ANTES da coluna existir indefinidamente, deixando
// `cat.linked` undefined pra toda categoria (não só a alterada pela
// migração) até alguém editar/salvar qualquer categoria pela UI. Um teto de
// alguns minutos garante que esse tipo de desvio se autocorrija sozinho.
export const MENU_CATEGORIES_TAG = "menu-categories";

export const getMenuCategories = unstable_cache(
  async () =>
    prisma.category.findMany({
      orderBy: { order: "asc" },
      include: { subcategories: { orderBy: { order: "asc" } } },
    }),
  ["menu-categories-all"],
  { tags: [MENU_CATEGORIES_TAG], revalidate: 300 }
);
