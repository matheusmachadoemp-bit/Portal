import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";

const STR_FIELDS = ["nome", "cupom", "observacoes"] as const;
const NUM_FIELDS = ["quantidadeUtilizada", "vendas", "gasto"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingPartner.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const body = await req.json();

  const data: Record<string, unknown> = {};
  for (const f of STR_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  for (const f of NUM_FIELDS) {
    if (body[f] !== undefined) data[f] = Number(body[f]) || 0;
  }

  const partner = await prisma.marketingPartner.update({ where: { id }, data });
  return NextResponse.json({ partner });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingPartner.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  await prisma.marketingPartner.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
