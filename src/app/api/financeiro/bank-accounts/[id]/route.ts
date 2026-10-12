import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { Prisma } from "@prisma/client";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.bankAccount.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "financeiro", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar contas bancárias." },
      { status: 403 }
    );
  }
  const body = await req.json();

  // Ligação da conta com a conexão do banco (Open Finance): decide de onde vêm os lançamentos, então
  // só administrador/gestor muda. O formulário reenvia o valor atual a cada salvamento; só conta como
  // mudança (e só então exige o cargo) se for diferente do que já está gravado.
  let openFinanceAccountId: string | null | undefined;
  if (body.openFinanceAccountId !== undefined) {
    const raw = typeof body.openFinanceAccountId === "string" ? body.openFinanceAccountId.trim() : "";
    const next = raw || null;
    if (next !== (existing.openFinanceAccountId ?? null)) {
      if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
        return NextResponse.json(
          { error: "Só administrador ou gestor pode ligar a conta à conexão com o banco." },
          { status: 403 }
        );
      }
      if (next && !/^[A-Za-z0-9_-]{8,100}$/.test(next)) {
        return NextResponse.json(
          { error: "ID da conta no banco inválido. Use só letras, números e hífen (cole exatamente como foi informado)." },
          { status: 400 }
        );
      }
      openFinanceAccountId = next;
    }
  }

  let account;
  try {
    account = await prisma.bankAccount.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        bank: body.bank ?? undefined,
        agencia: body.agencia ?? undefined,
        conta: body.conta ?? undefined,
        tipo: body.tipo ?? undefined,
        color: body.color ?? undefined,
        icon: body.icon ?? undefined,
        active: body.active ?? undefined,
        openFinanceAccountId,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Esta conta do banco já está ligada a outra conta bancária do portal." },
        { status: 409 }
      );
    }
    throw e;
  }

  return NextResponse.json({ account });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.bankAccount.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "financeiro", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir contas bancárias." },
      { status: 403 }
    );
  }
  await prisma.bankAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
