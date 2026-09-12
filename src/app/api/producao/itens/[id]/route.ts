import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PRODUCTION_MANAGER_ROLES } from "@/lib/producao-server";
import { hasModulePermission } from "@/lib/authz";
import { assertEmpresaAccess } from "@/lib/empresa";

type IngredienteInput = { ingredientId: string; quantidadeUsada: number; unidade: string };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "producao", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Produção." }, { status: 403 });
  }

  const { id } = await params;
  const item = await prisma.productionItem.findUnique({
    where: { id },
    include: {
      category: true,
      ingredientes: { include: { ingredient: { select: { id: true, name: true, unidade: true } } }, orderBy: { order: "asc" } },
      stock: true,
    },
  });
  if (!item) return NextResponse.json({ error: "Produto de produção não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, item.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode editar produtos de produção." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.productionItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Produto de produção não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "producao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar produtos de produção." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const ingredientes: IngredienteInput[] | undefined = Array.isArray(body.ingredientes) ? body.ingredientes : undefined;

  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.productionItem.update({
      where: { id },
      data: {
        categoryId: body.categoryId ?? undefined,
        name: body.name ?? undefined,
        unidade: body.unidade ?? undefined,
        fotoUrl: body.fotoUrl ?? undefined,
        descricao: body.descricao ?? undefined,
        tipo: body.tipo ?? undefined,
        quantidadeMinima: body.quantidadeMinima !== undefined ? Number(body.quantidadeMinima) : undefined,
        margemSeguranca: body.margemSeguranca !== undefined ? Number(body.margemSeguranca) : undefined,
        tamanhoLote: body.tamanhoLote !== undefined ? (body.tamanhoLote ? Number(body.tamanhoLote) : null) : undefined,
        validadeDias: body.validadeDias !== undefined ? (body.validadeDias ? Number(body.validadeDias) : null) : undefined,
        horarioLimitePadrao: body.horarioLimitePadrao ?? undefined,
        prioridadePadrao: body.prioridadePadrao ?? undefined,
        ingredientId: body.ingredientId !== undefined ? body.ingredientId || null : undefined,
        active: body.active ?? undefined,
      },
    });

    if (ingredientes) {
      await tx.productionItemIngredient.deleteMany({ where: { productionItemId: id } });
      if (ingredientes.length > 0) {
        await tx.productionItemIngredient.createMany({
          data: ingredientes.map((ing, order) => ({
            productionItemId: id,
            ingredientId: ing.ingredientId,
            quantidadeUsada: Number(ing.quantidadeUsada) || 0,
            unidade: ing.unidade || "g",
            order,
          })),
        });
      }
    }

    return tx.productionItem.findUniqueOrThrow({ where: { id }, include: { ingredientes: true, stock: true } });
  });

  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode excluir produtos de produção." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.productionItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Produto de produção não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "producao", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir produtos de produção." },
      { status: 403 }
    );
  }

  // Mantém o histórico de ordens já geradas — só desativa, não apaga (mesmo
  // espírito de "active" usado em Ingredient/Product).
  await prisma.productionItem.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
