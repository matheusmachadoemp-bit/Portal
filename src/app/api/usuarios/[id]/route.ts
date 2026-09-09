import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { hasModulePermission, resolveDefaultPermissionProfileId } from "@/lib/authz";

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

  // Ninguém pode alterar o próprio nível de acesso (role) nem o próprio perfil de
  // permissão por essa rota — mesmo um Gestor com permissão para editar usuários não
  // pode se autopromover trocando o próprio cargo, nem se dar mais acesso limpando o
  // próprio permissionProfileId (que hoje, depois da correção do fail-open, significaria
  // "sem acesso" — mas continua sendo uma alteração de nível de acesso que só deveria ser
  // feita por outra pessoa com permissão para isso, nunca pelo próprio usuário).
  if (id === user.id && (body.role !== undefined || body.permissionProfileId !== undefined)) {
    return NextResponse.json(
      { error: "Você não pode alterar seu próprio nível de acesso ou perfil de permissão." },
      { status: 403 }
    );
  }

  if (body.role !== undefined && body.role === "ADMINISTRADOR" && user.role !== "ADMINISTRADOR") {
    return NextResponse.json(
      { error: "Apenas um Administrador pode conceder o nível de acesso Administrador." },
      { status: 403 }
    );
  }

  if (body.password && String(body.password).length < 6) {
    return NextResponse.json(
      { error: "A nova senha precisa ter pelo menos 6 caracteres." },
      { status: 400 }
    );
  }

  let permissionProfileId: string | null | undefined;
  if (body.permissionProfileId !== undefined) {
    if (body.permissionProfileId) {
      permissionProfileId = body.permissionProfileId;
    } else {
      // Perfil deixado em branco: nunca deixa o usuário sem perfil de verdade (ver
      // resolveDefaultPermissionProfileId em @/lib/authz) — resolve o padrão a partir do
      // cargo que o usuário vai ter depois desta atualização (o novo, se `role` também
      // veio no body; senão o que ele já tem hoje).
      const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
      if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
      const nextRole = body.role ?? target.role;
      permissionProfileId = await resolveDefaultPermissionProfileId(nextRole);
    }
  }

  const data: Record<string, unknown> = {
    name: body.name ?? undefined,
    email: body.email ? body.email.toLowerCase().trim() : undefined,
    role: body.role ?? undefined,
    active: body.active ?? undefined,
    phone: body.phone ?? undefined,
    canViewGrupoNord: body.canViewGrupoNord !== undefined ? !!body.canViewGrupoNord : undefined,
    defaultEmpresaId: body.defaultEmpresaId !== undefined ? body.defaultEmpresaId || null : undefined,
    permissionProfileId,
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
