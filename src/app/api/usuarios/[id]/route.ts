import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { hasModulePermission } from "@/lib/authz";

async function ensureAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") return null;
  return session.user;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await ensureAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await hasModulePermission(user.id, "usuarios", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar usuários." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const body = await req.json();

  if (body.role !== undefined && body.role === "ADMINISTRADOR" && user.role !== "ADMINISTRADOR") {
    return NextResponse.json(
      { error: "Apenas um Administrador pode conceder o nível de acesso Administrador." },
      { status: 403 }
    );
  }

  const data: Record<string, unknown> = {
    name: body.name ?? undefined,
    email: body.email ? body.email.toLowerCase().trim() : undefined,
    role: body.role ?? undefined,
    active: body.active ?? undefined,
    phone: body.phone ?? undefined,
    canViewGrupoNord: body.canViewGrupoNord !== undefined ? !!body.canViewGrupoNord : undefined,
    defaultEmpresaId: body.defaultEmpresaId !== undefined ? body.defaultEmpresaId || null : undefined,
    permissionProfileId: body.permissionProfileId !== undefined ? body.permissionProfileId || null : undefined,
  };
  if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);

  await prisma.user.update({ where: { id }, data });

  if (body.permissions) {
    await prisma.userPermission.deleteMany({ where: { userId: id } });
    await prisma.userPermission.createMany({
      data: (body.permissions as { moduleKey: string; level: string }[]).map((p) => ({
        userId: id,
        moduleKey: p.moduleKey,
        level: p.level as never,
      })),
    });
  }

  if (body.empresaIds) {
    await prisma.userEmpresaAccess.deleteMany({ where: { userId: id } });
    await prisma.userEmpresaAccess.createMany({
      data: (body.empresaIds as string[]).map((empresaId) => ({ userId: id, empresaId })),
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await ensureAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await hasModulePermission(user.id, "usuarios", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir usuários." },
      { status: 403 }
    );
  }
  const { id } = await params;
  if (id === user.id) {
    return NextResponse.json({ error: "Você não pode excluir seu próprio usuário." }, { status: 400 });
  }
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
