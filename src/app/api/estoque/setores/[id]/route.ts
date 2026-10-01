import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { p2002ConstraintIncludes } from "@/lib/prisma-errors";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar setores de estoque." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const body = await req.json();

  const name = body.name !== undefined ? String(body.name).trim() : undefined;
  if (name !== undefined && !name) {
    return NextResponse.json({ error: "Informe o nome do setor." }, { status: 400 });
  }

  try {
    const sector = await prisma.stockSector.update({
      where: { id },
      data: {
        name: name ?? undefined,
        order: body.order !== undefined ? Number(body.order) : undefined,
        active: body.active !== undefined ? !!body.active : undefined,
      },
    });
    return NextResponse.json({ sector });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && (p2002ConstraintIncludes(e, "name") ?? true)) {
      return NextResponse.json({ error: "Já existe um setor com esse nome." }, { status: 400 });
    }
    throw e;
  }
}

/**
 * Exclusão de verdade (não um "soft delete" via `active: false`): diferente de `Ingredient`,
 * não existe nenhuma foreign key apontando pra `StockSector` — `Ingredient.setor` e
 * `StockCount.setor` são texto livre (ver comentário do model em schema.prisma), então não há
 * nada pra bloquear aqui. Produtos/contagens que já usam o nome deste setor continuam exibindo
 * normalmente depois da exclusão (o texto já salvo não muda); só desaparece da lista de opções
 * pra novos cadastros.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir setores de estoque." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const existing = await prisma.stockSector.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  await prisma.stockSector.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
