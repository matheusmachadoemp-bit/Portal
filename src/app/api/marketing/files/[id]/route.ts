import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingFile.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "marketing", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar arquivos de marketing." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.lancado !== "boolean") {
    return NextResponse.json({ error: "Campo 'lancado' é obrigatório e deve ser booleano." }, { status: 400 });
  }

  // Nada a gravar (nem a registrar no histórico) se o status já é o pedido.
  if (existing.lancado === body.lancado) return NextResponse.json({ file: existing });

  const file = await prisma.marketingFile.update({
    where: { id },
    data: { lancado: body.lancado },
  });

  // `after` segue a convenção do módulo (nome da entidade → novo estado), que é o que o
  // Resumo de Atividades do dashboard exibe: `atualizou "<after>"`.
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: existing.empresaId,
      action: "UPDATE",
      entityType: "MarketingFile",
      entityId: file.id,
      before: existing.lancado ? "Lançado" : "Não lançado",
      after: `${file.name} → ${file.lancado ? "Lançado" : "Não lançado"}`,
    },
  });

  return NextResponse.json({ file });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingFile.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "marketing", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir arquivos de marketing." },
      { status: 403 }
    );
  }
  await prisma.marketingFile.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
