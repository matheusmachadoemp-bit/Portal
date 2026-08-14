import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getCampanhaResultados } from "@/lib/crm-data";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const data = await getCampanhaResultados(id, empresaIdsForContext(ctx));
  if (!data) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const campanha = await prisma.campaign.findFirst({ where: { id, empresaId: { in: empresaIdsForContext(ctx) } } });
  if (!campanha) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });

  const body = await req.json();
  if (body.action === "enviar-agora") {
    const updated = await prisma.campaign.update({
      where: { id },
      data: { status: "ENVIADA", sentAt: new Date() },
    });
    await prisma.campaignRecipient.updateMany({ where: { campaignId: id }, data: { status: "ENVIADO" } });
    return NextResponse.json({ campanha: updated });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const campanha = await prisma.campaign.findFirst({ where: { id, empresaId: { in: empresaIdsForContext(ctx) } } });
  if (!campanha) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });

  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
