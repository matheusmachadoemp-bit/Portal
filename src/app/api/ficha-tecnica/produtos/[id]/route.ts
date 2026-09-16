import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

/** `Product.code` é `@unique` no schema inteiro (não por loja) — ver comentário em `PATCH`. */
function isProductCodeConflict(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    ((e.meta?.target as string[] | undefined)?.includes("code") ?? true)
  );
}

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
    name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Informe o nome do produto." }, { status: 400 });
    }
  }
  let code: string | undefined;
  if (body.code !== undefined) {
    code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) {
      return NextResponse.json({ error: "Informe o código do produto." }, { status: 400 });
    }
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

  try {
    await prisma.product.update({
      where: { id },
      data: {
        name: name ?? undefined,
        code: code ?? undefined,
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
      },
    });
  } catch (e) {
    if (isProductCodeConflict(e)) {
      return NextResponse.json({ error: "Este código já está em uso." }, { status: 409 });
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
