import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const courses = await prisma.course.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ courses });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const course = await prisma.course.create({
    data: {
      name: body.name,
      plataforma: body.plataforma || null,
      link: body.link || null,
      usuario: body.usuario || null,
      senha: body.senha || null,
      responsavel: body.responsavel || null,
      percentualConcluido: Number(body.percentualConcluido) || 0,
      startDate: body.startDate ? new Date(body.startDate) : null,
      prazo: body.prazo ? new Date(body.prazo) : null,
      certificadoUrl: body.certificadoUrl || null,
      observacoes: body.observacoes || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ course });
}
