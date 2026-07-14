import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const occurrences = await prisma.occurrence.findMany({
    orderBy: { date: "desc" },
    include: { employee: { select: { name: true, setor: true } } },
  });
  return NextResponse.json({ occurrences });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const occurrence = await prisma.occurrence.create({
    data: {
      employeeId: body.employeeId,
      date: new Date(body.date),
      type: body.type,
      horarioPrevisto: body.horarioPrevisto || null,
      horarioRealizado: body.horarioRealizado || null,
      minutosAtraso: Number(body.minutosAtraso) || 0,
      justificativa: body.justificativa || null,
      anexoUrl: body.anexoUrl || null,
      observacao: body.observacao || null,
      status: body.status || "PENDENTE",
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ occurrence });
}
