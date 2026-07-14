import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { encryptSecret } from "@/lib/vault";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.vaultEntry.findMany({
    orderBy: { systemName: "asc" },
    include: { createdBy: { select: { name: true } } },
  });

  const sanitized = entries.map((e) => ({
    id: e.id,
    systemName: e.systemName,
    site: e.site,
    username: e.username,
    category: e.category,
    responsavel: e.responsavel,
    observacao: e.observacao,
    updatedAt: e.updatedAt.toISOString(),
    createdBy: e.createdBy.name,
  }));

  return NextResponse.json({ entries: sanitized });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const entry = await prisma.vaultEntry.create({
    data: {
      systemName: body.systemName,
      site: body.site || null,
      username: body.username,
      passwordCipher: encryptSecret(body.password || ""),
      category: body.category || "Geral",
      responsavel: body.responsavel || null,
      observacao: body.observacao || null,
      createdById: session.user.id,
      history: { create: { changedBy: session.user.name ?? session.user.email ?? "", changeType: "CREATE" } },
    },
  });

  return NextResponse.json({ id: entry.id });
}
