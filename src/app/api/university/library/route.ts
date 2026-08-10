import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const items = await prisma.trainingLibraryItem.findMany({
    where: { OR: [{ empresaId: null }, { empresaId: { in: empresaIds } }] },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.name || !body.fileUrl) {
    return NextResponse.json({ error: "Nome e arquivo são obrigatórios." }, { status: 400 });
  }

  const item = await prisma.trainingLibraryItem.create({
    data: {
      name: body.name,
      category: body.category || "Documentos",
      fileUrl: body.fileUrl,
      mimeType: body.mimeType || null,
      sizeBytes: body.sizeBytes ? Number(body.sizeBytes) : null,
      tags: body.tags || null,
      empresaId: body.empresaId || null,
      uploadedById: session.user.id,
    },
  });

  return NextResponse.json({ item });
}
