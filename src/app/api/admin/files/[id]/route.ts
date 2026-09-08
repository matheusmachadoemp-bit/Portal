import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para editar arquivos." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const body = await req.json();

  const file = await prisma.fileItem.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      parentId: body.parentId !== undefined ? body.parentId : undefined,
      version: body.version !== undefined ? Number(body.version) : undefined,
    },
  });

  return NextResponse.json({ file });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para excluir arquivos." },
      { status: 403 }
    );
  }
  const { id } = await params;
  await prisma.fileItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
