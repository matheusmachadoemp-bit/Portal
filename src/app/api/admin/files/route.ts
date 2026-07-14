import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const body = await req.json();
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
