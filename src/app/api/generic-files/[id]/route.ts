import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canAccessGenericScope, resolveGenericScope } from "@/lib/generic-content";

async function loadItemScope(id: string) {
  const item = await prisma.genericFileItem.findUnique({
    where: { id },
    select: { categoryId: true, subcategoryId: true },
  });
  if (!item) return null;
  // Deriva a permissão do PRÓPRIO escopo gravado no item (nunca de algo vindo do corpo da
  // requisição) — ver aviso de segurança em `resolveGenericScope` (@/lib/generic-content).
  return resolveGenericScope({ categoryId: item.categoryId, subcategoryId: item.subcategoryId });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const scope = await loadItemScope(id);
  if (!scope) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  if (!(await canAccessGenericScope(session.user.id, scope, "canEdit"))) {
    return NextResponse.json({ error: "Sem permissão para editar este conteúdo." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) {
    return NextResponse.json({ error: "Informe um nome válido (até 200 caracteres)." }, { status: 400 });
  }
  // Só renomear (igual ao botão "Renomear" do gerenciador) — de propósito não aceita trocar
  // `parentId`/escopo por aqui, pro mesmo cuidado de não deixar um item pular de
  // categoria/subcategoria já descrito em `POST /api/generic-files`.
  const file = await prisma.genericFileItem.update({
    where: { id },
    data: { name },
  });

  return NextResponse.json({ file });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const scope = await loadItemScope(id);
  if (!scope) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  if (!(await canAccessGenericScope(session.user.id, scope, "canDelete"))) {
    return NextResponse.json({ error: "Sem permissão para excluir este conteúdo." }, { status: 403 });
  }

  // `onDelete: Cascade` na auto-relação `parent`/`children` (prisma/schema.prisma) já apaga toda a
  // subárvore se `id` for uma pasta — mesmo comportamento de /api/admin/files/[id].
  await prisma.genericFileItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
