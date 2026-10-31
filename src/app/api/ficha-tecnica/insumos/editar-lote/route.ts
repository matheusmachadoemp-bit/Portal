import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const MAX_IDS_POR_LOTE = 500;

type ResultadoItem = {
  id: string;
  nome: string | null;
  atualizado: boolean;
  motivo?: string;
};

/**
 * Edição em lote de Categoria e/ou Setor de insumos (Estoque > Produtos). Recebe
 * `{ ids: string[], categoryId?: string, setor?: string }` — só os campos PRESENTES no corpo são
 * alterados: se o cliente não enviar `categoryId`, a categoria de cada insumo não é tocada, e o
 * mesmo vale pra `setor` (mesma convenção de "ausente = não mudar" do
 * PATCH /api/ficha-tecnica/insumos/[id], mas sem a opção de "limpar" categoria/setor pra null por
 * aqui — cada campo presente precisa ser um valor não vazio; pelo menos um dos dois é obrigatório).
 *
 * Mesmo padrão "nunca tudo ou nada" de POST .../excluir-lote: processado em loop, um resultado por
 * item — um insumo não encontrado, de outra loja, ou com `categoryId` inválido PRA ESSA loja
 * específica (já que `StockCategory` é por empresa — um lote pode conter ids de mais de uma
 * empresa em modo Grupo Nord consolidado) não aborta o lote inteiro, só aquele item do resultado
 * reporta o motivo e os demais seguem normalmente.
 *
 * `setor` é texto livre (`Ingredient.setor` não é FK pra `StockSector` — ver comentário no
 * schema.prisma), então, igual ao PATCH individual, não há checagem de empresa pra ele: qualquer
 * string não vazia é aceita e salva como está.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Mesma permissão do PATCH individual (`canEdit` do módulo "ficha-tecnica") — editar em lote é
  // a mesma operação de editar um insumo, só repetida pra vários ids, não deve exigir (nem se
  // contentar com) uma permissão diferente.
  if (!(await hasModulePermission(session.user.id, "ficha-tecnica", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar insumos." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const rawIds = body?.ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0 || !rawIds.every((v) => typeof v === "string" && v.trim())) {
    return NextResponse.json({ error: "Informe ao menos um id de insumo em 'ids'." }, { status: 400 });
  }

  const ids = Array.from(new Set(rawIds as string[]));
  if (ids.length > MAX_IDS_POR_LOTE) {
    return NextResponse.json(
      { error: `Selecione no máximo ${MAX_IDS_POR_LOTE} insumos por vez.` },
      { status: 400 }
    );
  }

  const newCategoryId = typeof body?.categoryId === "string" && body.categoryId.trim() ? body.categoryId.trim() : undefined;
  const newSetor = typeof body?.setor === "string" && body.setor.trim() ? body.setor.trim() : undefined;
  if (!newCategoryId && !newSetor) {
    return NextResponse.json({ error: "Informe uma nova categoria e/ou um novo setor." }, { status: 400 });
  }

  // Cache por empresaId pra não repetir a mesma consulta de categoria quando vários ids do lote
  // pertencem à mesma loja (comum: a grande maioria dos lotes vem todo de uma única empresa).
  const categoryValidCache = new Map<string, boolean>();
  async function categoriaValidaPara(empresaId: string): Promise<boolean> {
    if (!newCategoryId) return true;
    const cached = categoryValidCache.get(empresaId);
    if (cached !== undefined) return cached;
    const category = await prisma.stockCategory.findUnique({
      where: { id: newCategoryId },
      select: { empresaId: true },
    });
    const valid = !!category && category.empresaId === empresaId;
    categoryValidCache.set(empresaId, valid);
    return valid;
  }

  const resultados: ResultadoItem[] = [];
  for (const id of ids) {
    const existing = await prisma.ingredient.findUnique({
      where: { id },
      select: { id: true, name: true, empresaId: true },
    });
    if (!existing) {
      resultados.push({ id, nome: null, atualizado: false, motivo: "Insumo não encontrado." });
      continue;
    }
    // Mesmo motivo do branch "não encontrado" acima (ver excluir-lote): `nome: null` pra não
    // vazar o nome de um insumo de uma loja que o usuário não tem acesso.
    if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
      resultados.push({ id, nome: null, atualizado: false, motivo: "Sem acesso a essa loja." });
      continue;
    }
    if (!(await categoriaValidaPara(existing.empresaId))) {
      resultados.push({ id, nome: existing.name, atualizado: false, motivo: "Categoria inválida para a loja deste insumo." });
      continue;
    }

    await prisma.ingredient.update({
      where: { id },
      data: {
        categoryId: newCategoryId ?? undefined,
        setor: newSetor ?? undefined,
      },
    });
    resultados.push({ id, nome: existing.name, atualizado: true });
  }

  const totalAtualizados = resultados.filter((r) => r.atualizado).length;
  const totalBloqueados = resultados.length - totalAtualizados;

  return NextResponse.json({ resultados, totalAtualizados, totalBloqueados });
}
