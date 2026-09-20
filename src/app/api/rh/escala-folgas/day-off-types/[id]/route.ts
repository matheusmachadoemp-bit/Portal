import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar tipos de folga." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const existing = await prisma.dayOffType.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  // `kind`/`key` nunca mudam por aqui: `kind` decide se a linha é reservada (FERIAS/AFASTAMENTO,
  // só o seed cria) e `key` é o identificador estável — trocar qualquer um dos dois depois de
  // criado poderia quebrar a leitura de `DayOffEntry`/integrações futuras que guardem a key.
  const dayOffType = await prisma.dayOffType.update({
    where: { id },
    data: {
      nome: typeof body?.nome === "string" && body.nome.trim() ? body.nome.trim() : undefined,
      cor: typeof body?.cor === "string" && body.cor ? body.cor : undefined,
      ordem: Number.isFinite(Number(body?.ordem)) ? Number(body.ordem) : undefined,
      ativo: typeof body?.ativo === "boolean" ? body.ativo : undefined,
    },
  });
  return NextResponse.json({ dayOffType });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir tipos de folga." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const existing = await prisma.dayOffType.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (existing.isSystem) {
    return NextResponse.json(
      { error: `"${existing.nome}" é um tipo reservado do sistema e não pode ser excluído.` },
      { status: 409 }
    );
  }

  try {
    await prisma.dayOffType.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        {
          error: `Não é possível excluir "${existing.nome}" porque já existem folgas cadastradas com esse tipo. Em vez de excluir, desative (desmarque "Ativo").`,
        },
        { status: 409 }
      );
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}
