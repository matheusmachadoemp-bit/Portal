import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMenuCategories } from "@/lib/menu-categories";

/**
 * Lista dinâmica de "módulo afetado" pro formulário da Central de Bugs e Melhorias (Fase 2,
 * Caio) — consulta Category/Subcategory do banco (`getMenuCategories`, já cacheado e usado pelo
 * menu lateral), nunca uma lista hardcoded no front: evita opções desatualizadas quando um
 * módulo novo é criado/renomeado/desativado.
 *
 * Qualquer usuário autenticado pode consultar (precisa aparecer no formulário de envio, que
 * não exige nenhuma permissão de módulo — ver `POST /api/feedback`). Só categorias/subcategorias
 * ATIVAS aparecem — um módulo desativado não deveria ser selecionável como "módulo afetado" de
 * um relato novo (relatos já existentes continuam com o vínculo antigo, só a opção some do
 * formulário pra frente).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await getMenuCategories();

  const modulos = categories
    .filter((c) => c.active)
    .map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      subcategories: c.subcategories.filter((s) => s.active).map((s) => ({ id: s.id, key: s.key, name: s.name })),
    }));

  return NextResponse.json({ modulos });
}
