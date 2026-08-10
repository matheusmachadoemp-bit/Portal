import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const files = await prisma.marketingFile.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } }, empresa: { select: { name: true } } },
  });

  return NextResponse.json({ files });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível enviar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!body.name || !body.fileUrl) {
    return NextResponse.json({ error: "Nome e arquivo são obrigatórios." }, { status: 400 });
  }

  const file = await prisma.marketingFile.create({
    data: {
      empresaId: empresa.id,
      name: body.name,
      category: body.category || "Artes",
      fileUrl: body.fileUrl,
      mimeType: body.mimeType || null,
      sizeBytes: body.sizeBytes ? Number(body.sizeBytes) : null,
      tags: body.tags || null,
      taskId: body.taskId || null,
      uploadedById: session.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: empresa.id,
      action: "UPLOAD",
      entityType: "MarketingFile",
      entityId: file.id,
      after: file.name,
    },
  });

  return NextResponse.json({ file });
}
