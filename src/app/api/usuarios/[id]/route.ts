import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { hasModulePermission, resolveDefaultPermissionProfileId } from "@/lib/authz";

// Espelha `OPERATIONAL_ROLES` de `src/app/api/usuarios/route.ts` (POST) — qualquer mudança lá
// precisa ser replicada aqui. Usado só pelo guard de troca de Nível de acesso perto do bloco de
// `employeeId` abaixo.
const OPERATIONAL_ROLES = ["GERENTE", "SUPERVISOR", "COLABORADOR"];

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

  // Nome vazio/só espaço (ou `null` explícito) não é um "não mexe" — isso é a chave `name`
  // ausente do body (`undefined`), tratada como no-op logo abaixo. Sem essa checagem, um
  // PATCH { name: "" } passava direto e gravava o usuário sem nome no banco silenciosamente
  // (reproduzido ao vivo: 200 OK, nome virou "" no banco). `name` é obrigatório e não-nulo no
  // schema (`User.name String`), então mesmo um `null` explícito é rejeitado aqui, não só
  // ignorado. Mesmo padrão/mensagem de erro do POST /api/usuarios (nome obrigatório).
  let name: string | undefined;
  if (body.name !== undefined) {
    name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Informe o nome do usuário." }, { status: 400 });
    }
  }

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

  // employeeId (vínculo com a ficha de RH): `undefined` = não mexe; `null`/vazio = desvincula;
  // um id = precisa existir e não estar vinculado a OUTRO usuário (o próprio usuário sendo
  // editado já vinculado a essa mesma ficha não é erro — reenviar o mesmo valor é um no-op).
  // Mesma ideia de "erro claro em vez de deixar a constraint @unique do banco estourar como
  // 500" da rota de criação (POST /api/usuarios).
  let employeeId: string | null | undefined;
  if (body.employeeId !== undefined) {
    if (body.employeeId) {
      const employee = await prisma.employee.findUnique({
        where: { id: body.employeeId },
        select: { id: true, user: { select: { id: true } } },
      });
      if (!employee) {
        return NextResponse.json({ error: "Ficha de funcionário (RH) não encontrada." }, { status: 400 });
      }
      if (employee.user && employee.user.id !== id) {
        return NextResponse.json(
          { error: "Esta ficha de funcionário já está vinculada a outro usuário." },
          { status: 409 }
        );
      }
      employeeId = employee.id;
    } else {
      employeeId = null;
    }
  }

  // Fecha a brecha "criar como Administrador/Gestor (sem ficha, permitido) e depois promover
  // por aqui pra um papel operacional sem nunca vincular uma ficha de RH" — mesma exigência da
  // criação (POST /api/usuarios). Dispara quando ESTE PATCH está, ele mesmo, mudando algo que
  // pode levar o usuário pro estado inválido "role operacional sem ficha": (a) o role está
  // mudando PARA um papel operacional, ou (b) o employeeId está mudando de VALOR neste PATCH
  // (pra outra ficha ou pra nulo) enquanto o role FINAL (o que veio no body, ou o que o usuário
  // já tinha) é operacional. O caso (b) é o que fecha a brecha #458/#455: antes, um PATCH só com
  // `employeeId: null` (sem tocar `role`) passava direto porque a checagem só olhava pra troca
  // de role, deixando um usuário operacional sem ficha vinculada.
  //
  // De propósito NÃO dispara só porque o role final é operacional sem nenhum dos dois campos
  // (role/employeeId) estar de fato MUDANDO DE VALOR neste PATCH — isso pegaria também edições
  // comuns (ex.: só telefone) de usuário operacional antigo que já existia sem ficha, forçando
  // um ajuste retroativo que o Matheus pediu pra NÃO fazer. Tanto o role quanto o employeeId são
  // comparados contra o valor ATUAL do usuário (não contra "o campo só está presente no body")
  // pelo mesmo motivo: a tela de Usuários (`usuarios-client.tsx`) sempre reenvia o `form` inteiro
  // — role e employeeId incluídos — mesmo quando o admin só mudou outro campo (ex.: telefone), e
  // usar "a chave veio no body" em vez de "o valor mudou" faria esse reenvio de rotina disparar a
  // validação sempre que o usuário editado já for operacional, travando até edições sem relação
  // nenhuma com role/ficha (achado do Teulis na revisão desta mesma tarefa). `employeeId` (a
  // variável já normalizada acima, não `body.employeeId`) trata string vazia como `null`, então
  // reenviar `""` quando já era `null` conta como "não mudou", igual a reenviar o mesmo role.
  if (body.role !== undefined || body.employeeId !== undefined) {
    const currentUser = await prisma.user.findUnique({ where: { id }, select: { role: true, employeeId: true } });
    if (!currentUser) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    const finalRole = body.role !== undefined ? body.role : currentUser.role;
    const roleActuallyChanging = body.role !== undefined && body.role !== currentUser.role;
    const employeeIdActuallyChanging = employeeId !== undefined && employeeId !== currentUser.employeeId;
    if (OPERATIONAL_ROLES.includes(finalRole) && (roleActuallyChanging || employeeIdActuallyChanging)) {
      const resultingEmployeeId = employeeId !== undefined ? employeeId : currentUser.employeeId;
      if (!resultingEmployeeId) {
        return NextResponse.json(
          {
            error:
              "Para o nível de acesso Gerente, Supervisor ou Colaborador, este usuário precisa de uma ficha de funcionário (RH) vinculada. Selecione uma ficha de RH antes de salvar.",
          },
          { status: 400 }
        );
      }
    }
  }

  // E-mail já usado por OUTRO usuário: `email` é `@unique` no schema, então sem essa checagem
  // prévia o Prisma lança PrismaClientKnownRequestError (P2002) e a rota devolve um 500 sem
  // corpo — mesmo problema (e mesma correção) do POST /api/usuarios. Reenviar o próprio e-mail
  // do usuário sendo editado não é erro (no-op); só bloqueia se já pertencer a outro usuário.
  let email: string | undefined;
  if (body.email) {
    email = String(body.email).toLowerCase().trim();
    const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingEmail && existingEmail.id !== id) {
      return NextResponse.json(
        { error: "Este e-mail já está cadastrado por outro usuário." },
        { status: 409 }
      );
    }
  }

  const data: Record<string, unknown> = {
    name,
    email,
    role: body.role ?? undefined,
    active: body.active ?? undefined,
    phone: body.phone ?? undefined,
    canViewGrupoNord: body.canViewGrupoNord !== undefined ? !!body.canViewGrupoNord : undefined,
    defaultEmpresaId: body.defaultEmpresaId !== undefined ? body.defaultEmpresaId || null : undefined,
    permissionProfileId,
    employeeId,
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
  try {
    await prisma.user.delete({ where: { id } });
  } catch (e) {
    // Dezenas de relações obrigatórias apontam pra User com `onDelete: Restrict` — não só
    // Sale.createdById / SalesEntry.createdById / MarketingEntry.createdById (anotados de
    // propósito, ver #168), mas também Task.createdById, Purchase.createdById,
    // Chamado.solicitanteId, FileItem.uploadedById e mais de 50 outras no schema. Qualquer
    // uma delas faz o Prisma lançar PrismaClientKnownRequestError (P2003) ao tentar excluir
    // o usuário — sem essa checagem a rota devolvia um 500 sem corpo (mesmo estilo de
    // tratamento do e-mail duplicado, P2002, acima). A mensagem não cita uma tabela
    // específica de propósito: não dá pra saber qual das dezenas de relações foi a
    // responsável sem inspecionar o erro em detalhe, e citar a tabela errada confundiria
    // mais do que ajudaria.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "Não é possível excluir este usuário porque ele tem registros vinculados no sistema (vendas, lançamentos, tarefas, compras, arquivos etc.). Desative o usuário em vez de excluir.",
        },
        { status: 409 }
      );
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}
