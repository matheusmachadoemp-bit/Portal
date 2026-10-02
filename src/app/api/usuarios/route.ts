import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { hasModulePermission, resolveDefaultPermissionProfileId } from "@/lib/authz";

// Papéis OPERACIONAIS — quem de fato tem (ou deveria ter) uma ficha de RH de verdade (cargo,
// treinamento, pontuação) por trás do login. Usado só na criação (ver bloco de `employeeId`
// abaixo) pra exigir o vínculo com `Employee` desde o nascimento do usuário — pedido direto do
// Matheus depois de ver RH/Universidade/Checklist contarem a mesma pessoa como gente diferente
// quando esse vínculo fica de fora (ver comentário no bloco de `employeeId` mais abaixo e a
// correção equivalente em src/lib/rh-insights.ts, insight #8 "Treinamento em atraso").
// ADMINISTRADOR/GESTOR ficam de fora de propósito: são níveis de acesso ao SISTEMA (dono,
// administrador), não necessariamente alguém com cargo/ficha de RH — o próprio Matheus mantém 2
// contas desse tipo sem ficha, intencionalmente. Espelhado em `usuarios-client.tsx`
// (validação client-side) — qualquer mudança aqui precisa ser replicada lá.
const OPERATIONAL_ROLES = ["GERENTE", "SUPERVISOR", "COLABORADOR"];

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
    include: { permissions: true, empresaAccess: true, _count: { select: { pushSubscriptions: true } } },
  });

  // Mesmo formato de `src/app/portal/usuarios/page.tsx` (o server component que monta
  // `initialUsers` no primeiro carregamento da tela) — sem isso, um refresh da lista feito por
  // aqui (ex.: depois de criar/editar/excluir um usuário, ver `usuarios-client.tsx`) apagava
  // `permissionProfileId`/`defaultEmpresaId`/`canViewGrupoNord`/`empresaIds` de todo mundo no
  // estado em memória (o formulário de edição já lê esses 4 campos há tempos, mas essa rota
  // nunca os devolvia) até a próxima recarga completa da página. `empresaIds` deriva de
  // `empresaAccess` do mesmo jeito que `page.tsx` já faz — não é um formato novo. Mesma história
  // pra `pushSubscriptionsCount` (coluna "Notificações"): sem ele aqui, todo mundo aparecia
  // "Desativadas" depois de qualquer refresh, mesmo com push ativado de verdade.
  const sanitized = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    phone: u.phone,
    employeeId: u.employeeId,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    lastActivityAt: u.lastActivityAt ? u.lastActivityAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    pushSubscriptionsCount: u._count.pushSubscriptions,
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

  // Nunca deixa criar um usuário sem nome nem sem e-mail: sem essa checagem, um POST com esses
  // campos vazios passava direto e criava uma conta "órfã" (sem e-mail pra logar, por exemplo)
  // silenciosamente — o cliente hoje não tem `required` nesses campos (ver usuarios-client.tsx),
  // então a API precisa ser a linha de defesa real. Mesmo padrão usado abaixo pra e-mail
  // duplicado e em POST /api/checklist/templates pra nome/itens obrigatórios.
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Informe o nome do usuário." }, { status: 400 });
  }
  const email = String(body.email || "").toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: "Informe o e-mail do usuário." }, { status: 400 });
  }

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
  // quem pode preencher qual cargo, e RH/Universidade/Checklist usam o mesmo vínculo pra não
  // tratar a mesma pessoa como gente diferente em cada módulo, ver OPERATIONAL_ROLES acima):
  // OBRIGATÓRIO na criação para os papéis operacionais (Gerente/Supervisor/Colaborador);
  // continua opcional para Administrador/Gestor. Quando informado (nos dois casos), precisa
  // existir e não estar vinculado a outro User — devolve um erro claro em vez de deixar a
  // constraint `@unique` do banco estourar como 500.
  if (OPERATIONAL_ROLES.includes(role) && !body.employeeId) {
    return NextResponse.json(
      {
        error:
          "Para o nível de acesso Gerente, Supervisor ou Colaborador, selecione a ficha de funcionário (RH) deste usuário — é o que permite computar pontuação, conquistas e os dados de RH/Universidade/Checklist como uma pessoa só.",
      },
      { status: 400 }
    );
  }
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

  // E-mail já cadastrado por outro usuário: `email` é `@unique` no schema, então sem essa
  // checagem prévia o Prisma lança PrismaClientKnownRequestError (P2002) e a rota devolve
  // um 500 sem corpo — confere antes de criar e devolve um erro claro, mesmo padrão do
  // conflito de employeeId acima.
  const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingEmail) {
    return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 409 });
  }

  const created = await prisma.user.create({
    data: {
      name,
      email,
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
