import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { isValidBlobUrl } from "@/lib/manutencao-server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para acessar os arquivos." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const folderType = searchParams.get("folderType") ?? "ARQUIVO";

  const files = await prisma.fileItem.findMany({
    where: { folderType: folderType as never },
    orderBy: [{ isFolder: "desc" }, { name: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ files });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para cadastrar arquivos." },
      { status: 403 }
    );
  }

  const body = await req.json();

  if (body.fileUrl && !isValidBlobUrl(body.fileUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

  const file = await prisma.fileItem.create({
    data: {
      name: body.name,
      folderType: body.folderType || "ARQUIVO",
      parentId: body.parentId || null,
      isFolder: !!body.isFolder,
      fileUrl: body.fileUrl || null,
      mimeType: body.mimeType || null,
      sizeBytes: body.sizeBytes || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ file });
}
