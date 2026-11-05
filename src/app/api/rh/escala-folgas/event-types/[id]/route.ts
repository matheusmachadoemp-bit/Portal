import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

/**
 * Editar/excluir um tipo de evento (`EventType`) — mesmo padrão de
 * `/api/rh/escala-folgas/day-off-types/[id]`, mas sem a trava de `isSystem` (não existe tipo
 * reservado aqui, ver comentário na rota base `/api/rh/escala-folgas/event-types`).
 */
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar tipos de evento." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const existing = await prisma.eventType.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  // `key` nunca muda por aqui, mesmo racional de `DayOffType`: é o identificador estável, trocar
  // depois de criado poderia quebrar leitura/integração futura que guarde a key.
  const eventType = await prisma.eventType.update({
    where: { id },
    data: {
      nome: typeof body?.nome === "string" && body.nome.trim() ? body.nome.trim() : undefined,
      cor: typeof body?.cor === "string" && body.cor ? body.cor : undefined,
      ordem: Number.isFinite(Number(body?.ordem)) ? Number(body.ordem) : undefined,
      ativo: typeof body?.ativo === "boolean" ? body.ativo : undefined,
    },
  });
  return NextResponse.json({ eventType });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir tipos de evento." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const existing = await prisma.eventType.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  try {
    await prisma.eventType.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        {
          error: `Não é possível excluir "${existing.nome}" porque já existem eventos cadastrados com esse tipo. Em vez de excluir, desative (desmarque "Ativo").`,
        },
        { status: 409 }
      );
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}
