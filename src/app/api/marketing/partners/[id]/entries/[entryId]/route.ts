import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const NUM_FIELDS = ["quantidadeUtilizada", "vendas", "gasto"] as const;

async function findEntry(id: string, entryId: string) {
  return prisma.marketingPartnerEntry.findFirst({
    where: { id: entryId, partnerId: id },
    include: { partner: { select: { empresaId: true } } },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, entryId } = await params;
  const existing = await findEntry(id, entryId);
  if (!existing) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.partner.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "marketing", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar lançamentos de parceiros." },
      { status: 403 }
    );
  }
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.date) data.date = new Date(body.date);
  if (body.observacoes !== undefined) data.observacoes = body.observacoes || null;
  for (const f of NUM_FIELDS) {
    if (body[f] !== undefined) data[f] = Number(body[f]) || 0;
  }

  const entry = await prisma.marketingPartnerEntry.update({
    where: { id: entryId },
    data,
    include: { createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ entry });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, entryId } = await params;
  const existing = await findEntry(id, entryId);
  if (!existing) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.partner.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "marketing", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir lançamentos de parceiros." },
      { status: 403 }
    );
  }
  await prisma.marketingPartnerEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}
