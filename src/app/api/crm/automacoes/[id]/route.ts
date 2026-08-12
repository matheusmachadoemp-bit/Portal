import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const automacao = await prisma.automation.findFirst({ where: { id, empresaId: { in: empresaIdsForContext(ctx) } } });
  if (!automacao) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("active" in body) data.active = !!body.active;
  if ("name" in body) data.name = String(body.name).trim();
  if ("waitDays" in body) data.waitDays = Number(body.waitDays) || 0;
  if ("message" in body) data.message = body.message;

  const updated = await prisma.automation.update({ where: { id }, data });
  return NextResponse.json({ automacao: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const automacao = await prisma.automation.findFirst({ where: { id, empresaId: { in: empresaIdsForContext(ctx) } } });
  if (!automacao) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });

  await prisma.automation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
