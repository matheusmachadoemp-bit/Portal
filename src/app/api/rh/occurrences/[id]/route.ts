import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const occurrence = await prisma.occurrence.update({
    where: { id },
    data: {
      date: body.date ? new Date(body.date) : undefined,
      type: body.type ?? undefined,
      horarioPrevisto: body.horarioPrevisto ?? undefined,
      horarioRealizado: body.horarioRealizado ?? undefined,
      minutosAtraso: body.minutosAtraso !== undefined ? Number(body.minutosAtraso) : undefined,
      justificativa: body.justificativa ?? undefined,
      anexoUrl: body.anexoUrl ?? undefined,
      observacao: body.observacao ?? undefined,
      status: body.status ?? undefined,
    },
  });

  return NextResponse.json({ occurrence });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.occurrence.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
