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

export async function GET() {
  const user = await ensureAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    include: { permissions: true },
  });

  const sanitized = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    phone: u.phone,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    permissions: u.permissions.map((p) => ({ moduleKey: p.moduleKey, level: p.level })),
  }));

  return NextResponse.json({ users: sanitized });
}

export async function POST(req: Request) {
  const user = await ensureAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await hasModulePermission(user.id, "usuarios", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar usuários." },
      { status: 403 }
    );
  }

  const body = await req.json();

  const role = body.role || "COLABORADOR";
  if (role === "ADMINISTRADOR" && user.role !== "ADMINISTRADOR") {
    return NextResponse.json(
      { error: "Apenas um Administrador pode criar outro usuário com nível de acesso Administrador." },
      { status: 403 }
    );
  }

  if (!body.password || String(body.password).length < 6) {
    return NextResponse.json(
      { error: "Informe uma senha inicial com pelo menos 6 caracteres." },
      { status: 400 }
    );
  }
  const passwordHash = await bcrypt.hash(body.password, 10);
  const empresaIds: string[] = body.empresaIds || [];

  const created = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase().trim(),
      passwordHash,
      role,
      phone: body.phone || null,
      canViewGrupoNord: !!body.canViewGrupoNord,
      defaultEmpresaId: body.defaultEmpresaId || empresaIds[0] || null,
      permissionProfileId: body.permissionProfileId || null,
      empresaAccess: { create: empresaIds.map((empresaId) => ({ empresaId })) },
    },
  });

  return NextResponse.json({ id: created.id });
}
