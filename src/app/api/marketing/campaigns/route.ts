import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const campaigns = await prisma.marketingCampaign.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { startDate: "desc" },
    include: {
      responsavel: { select: { name: true } },
      empresa: { select: { name: true, color: true } },
      tasks: { select: { id: true, status: true } },
    },
  });

  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }
  if (!body.startDate || !body.endDate) {
    return NextResponse.json({ error: "Período é obrigatório." }, { status: 400 });
  }

  const campaign = await prisma.marketingCampaign.create({
    data: {
      empresaId: empresa.id,
      name: body.name,
      objective: body.objective || null,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      budget: Number(body.budget) || 0,
      investimento: Number(body.investimento) || 0,
      retorno: Number(body.retorno) || 0,
      responsavelId: body.responsavelId || null,
      status: body.status || "PLANEJADA",
      resultados: body.resultados || null,
      createdById: session.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: empresa.id,
      action: "CREATE",
      entityType: "MarketingCampaign",
      entityId: campaign.id,
      after: campaign.name,
    },
  });

  return NextResponse.json({ campaign });
}
