import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getActiveEmpresaContext, empresaIdsForContext } from "@/lib/empresa";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { fileUrl, fileName, mimeType, observacao, itemResponseId } = body;

  if (!fileUrl || !fileName) {
    return NextResponse.json({ error: "Arquivo de foto inválido." }, { status: 400 });
  }

  const occurrence = await prisma.checklistOccurrence.findFirst({
    where: { id, empresaId: { in: empresaIdsForContext(ctx) } },
  });
  if (!occurrence) return NextResponse.json({ error: "Checklist não encontrado." }, { status: 404 });

  const photo = await prisma.checklistPhoto.create({
    data: {
      occurrenceId: id,
      itemResponseId: itemResponseId || null,
      fileUrl,
      fileName,
      mimeType: mimeType || null,
      observacao: observacao || null,
      uploadedById: session.user.id,
    },
  });

  return NextResponse.json({ photo });
}
