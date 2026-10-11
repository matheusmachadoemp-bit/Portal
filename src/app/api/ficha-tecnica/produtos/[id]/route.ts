import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { isValidBlobUrl } from "@/lib/manutencao-server";
import { isProductCategory } from "@/lib/ficha-code-core";
import { cleanProductName, normalizeProductName } from "@/lib/ficha-nome";
import { DuplicateProductNameError, withUniqueProductName } from "@/lib/ficha-nome-server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "ficha-tecnica", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar produtos." },
      { status: 403 }
    );
  }
  const body = await req.json();

  let name: string | undefined;
  if (body.name !== undefined) {
    name = typeof body.name === "string" ? cleanProductName(body.name) : "";
    if (!name) {
      return NextResponse.json({ error: "Informe o nome do produto." }, { status: 400 });
    }
  }
  // O código de identificação é gerado pelo sistema na criação e NÃO muda por edição (serve pra
  // localizar o produto): `body.code` é ignorado de propósito.
  if (body.category !== undefined && !isProductCategory(body.category)) {
    return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
  }
  if (body.photoUrl && !isValidBlobUrl(body.photoUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

  if (body.ingredients) {
    const ingredientIds = [
      ...new Set((body.ingredients as { ingredientId: string }[]).map((i) => i.ingredientId).filter(Boolean)),
    ];
    if (ingredientIds.length) {
      const validCount = await prisma.ingredient.count({
        where: { id: { in: ingredientIds }, empresaId: existing.empresaId },
      });
      if (validCount !== ingredientIds.length) {
        return NextResponse.json({ error: "Um ou mais insumos informados não pertencem a esta loja." }, { status: 400 });
      }
    }
  }

  const data = {
    name: name ?? undefined,
    category: body.category ?? undefined,
    photoUrl: body.photoUrl !== undefined ? body.photoUrl || null : undefined,
    taxaIfood: body.taxaIfood !== undefined ? (body.taxaIfood === "" || body.taxaIfood === null ? null : Number(body.taxaIfood)) : undefined,
    description: body.description ?? undefined,
    rendimento: body.rendimento ?? undefined,
    tamanho: body.tamanho ?? undefined,
    pesoFinal: body.pesoFinal !== undefined ? Number(body.pesoFinal) : undefined,
    precoVenda: body.precoVenda !== undefined ? Number(body.precoVenda) : undefined,
    modoPreparo: body.modoPreparo ?? undefined,
    tempoPreparo: body.tempoPreparo !== undefined ? Number(body.tempoPreparo) : undefined,
    validade: body.validade ?? undefined,
    responsavel: body.responsavel ?? undefined,
  };

  // Só confere o nome quando ele realmente mudou (ignorando maiúscula/acento/espaço): produtos
  // antigos que já estavam com nome repetido continuam editáveis (preço, ingredientes...) até
  // alguém renomear um deles.
  const newName = name !== undefined && normalizeProductName(name) !== normalizeProductName(existing.name) ? name : null;
  try {
    if (newName !== null) {
      await withUniqueProductName(existing.empresaId, newName, id, (tx) => tx.product.update({ where: { id }, data }));
    } else {
      await prisma.product.update({ where: { id }, data });
    }
  } catch (e) {
    if (e instanceof DuplicateProductNameError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  if (body.ingredients) {
    await prisma.productIngredient.deleteMany({ where: { productId: id } });
    await prisma.productIngredient.createMany({
      data: body.ingredients.map(
        (i: { ingredientId: string; quantidadeUsada: string; percentualPerda: string }, idx: number) => ({
          productId: id,
          ingredientId: i.ingredientId,
          quantidadeUsada: Number(i.quantidadeUsada) || 0,
          percentualPerda: Number(i.percentualPerda) || 0,
          order: idx,
        })
      ),
    });
  }

  const product = await prisma.product.findUnique({
    where: { id },
    include: { ingredients: { include: { ingredient: true }, orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ product });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "ficha-tecnica", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir produtos." },
      { status: 403 }
    );
  }
  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
