import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.notification.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  }

  const body = await req.json();
  const notification = await prisma.notification.update({
    where: { id },
    data: { read: body.read !== undefined ? !!body.read : true },
  });

  return NextResponse.json({ notification });
}
