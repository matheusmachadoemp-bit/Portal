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

export async function GET() {
  const user = await ensureAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await hasModulePermission(user.id, "usuarios", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver Usuários." },
      { status: 403 }
    );
  }

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    include: { permissions: true, empresaAccess: true },
  });

  // Mesmo formato de `src/app/portal/usuarios/page.tsx` (o server component que monta
  // `initialUsers` no primeiro carregamento da tela) — sem isso, um refresh da lista feito por
  // aqui (ex.: depois de criar/editar/excluir um usuário, ver `usuarios-client.tsx`) apagava
  // `permissionProfileId`/`defaultEmpresaId`/`canViewGrupoNord`/`empresaIds` de todo mundo no
  // estado em memória (o formulário de edição já lê esses 4 campos há tempos, mas essa rota
  // nunca os devolvia) até a próxima recarga completa da página. `empresaIds` deriva de
  // `empresaAccess` do mesmo jeito que `page.tsx` já faz — não é um formato novo.
  const sanitized = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    phone: u.phone,
    employeeId: u.employeeId,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    permissions: u.permissions.map((p) => ({ moduleKey: p.moduleKey, level: p.level })),
    empresaIds: u.empresaAccess.map((a) => a.empresaId),
    canViewGrupoNord: u.canViewGrupoNord,
    defaultEmpresaId: u.defaultEmpresaId,
    permissionProfileId: u.permissionProfileId,
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

  const permissions: { moduleKey: string; level: string }[] = body.permissions || [];

  // Nunca deixa um usuário ser criado sem `permissionProfileId`: usuário sem perfil
  // atribuído fica sem acesso a nenhum módulo operacional (ver hasModulePermission em
  // @/lib/authz) — se o formulário não escolheu um perfil, resolve o padrão do cargo.
  const permissionProfileId = body.permissionProfileId || (await resolveDefaultPermissionProfileId(role));

  // employeeId (vínculo com a ficha de RH — Fechamento do Dia passou a exigir isso pra saber
  // quem pode preencher qual cargo): opcional, mas se informado precisa existir e não estar
  // vinculado a outro User — devolve um erro claro em vez de deixar a constraint `@unique` do
  // banco estourar como 500.
  let employeeId: string | null = null;
  if (body.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: body.employeeId }, select: { id: true, user: { select: { id: true } } } });
    if (!employee) {
      return NextResponse.json({ error: "Ficha de funcionário (RH) não encontrada." }, { status: 400 });
    }
    if (employee.user) {
      return NextResponse.json(
        { error: "Esta ficha de funcionário já está vinculada a outro usuário." },
        { status: 409 }
      );
    }
    employeeId = employee.id;
  }

  const created = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase().trim(),
      passwordHash,
      role,
      phone: body.phone || null,
      canViewGrupoNord: !!body.canViewGrupoNord,
      defaultEmpresaId: body.defaultEmpresaId || empresaIds[0] || null,
      permissionProfileId,
      employeeId,
      empresaAccess: { create: empresaIds.map((empresaId) => ({ empresaId })) },
      permissions: { create: permissions.map((p) => ({ moduleKey: p.moduleKey, level: p.level as never })) },
    },
  });

  return NextResponse.json({ id: created.id });
}
