import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const tasks = await prisma.marketingTask.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: [{ date: "asc" }, { order: "asc" }],
    include: {
      responsavel: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true } },
      empresa: { select: { id: true, name: true, color: true } },
      comments: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      files: true,
    },
  });

  return NextResponse.json({ tasks });
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
  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: "Título é obrigatório." }, { status: 400 });
  }

  const task = await prisma.marketingTask.create({
    data: {
      empresaId: empresa.id,
      title: body.title,
      description: body.description || null,
      objetivo: body.objetivo || null,
      category: body.category || null,
      socialNetwork: body.socialNetwork || null,
      format: body.format || null,
      status: body.status || "A_PRODUZIR",
      priority: body.priority || "MEDIA",
      date: body.date ? new Date(body.date) : null,
      time: body.time || null,
      responsavelId: body.responsavelId || null,
      checklist: body.checklist ?? null,
      tags: body.tags || null,
      estimatedMinutes: body.estimatedMinutes ? Number(body.estimatedMinutes) : null,
      actualMinutes: body.actualMinutes ? Number(body.actualMinutes) : null,
      recurrenceRule: body.recurrenceRule || null,
      campaignId: body.campaignId || null,
      createdById: session.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: empresa.id,
      action: "CREATE",
      entityType: "MarketingTask",
      entityId: task.id,
      after: task.title,
    },
  });

  return NextResponse.json({ task });
}
