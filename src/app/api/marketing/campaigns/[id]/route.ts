import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";

const STR_FIELDS = ["name", "objective", "status", "resultados", "responsavelId"] as const;
const NUM_FIELDS = ["budget", "investimento", "retorno"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingCampaign.findUnique({ where: { id } });
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
  if (body.startDate) data.startDate = new Date(body.startDate);
  if (body.endDate) data.endDate = new Date(body.endDate);

  const campaign = await prisma.marketingCampaign.update({ where: { id }, data });
  return NextResponse.json({ campaign });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingCampaign.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  await prisma.marketingCampaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
