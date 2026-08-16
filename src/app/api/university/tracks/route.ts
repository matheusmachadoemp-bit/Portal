import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/permissions";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const tracks = await prisma.trainingTrack.findMany({
    where: { OR: [{ empresaId: null }, { empresaId: { in: empresaIds } }] },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      empresa: { select: { name: true } },
      courses: { orderBy: { order: "asc" }, include: { course: { select: { id: true, name: true, cargaHoraria: true, status: true } } } },
    },
  });

  return NextResponse.json({ tracks });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para criar trilhas." }, { status: 403 });
  }

  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }

  const key = `${String(body.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;

  const track = await prisma.trainingTrack.create({
    data: {
      key,
      name: body.name,
      cargo: body.cargo || null,
      empresaId: body.empresaId || null,
      description: body.description || null,
      icon: body.icon || "GraduationCap",
      color: body.color || "#2952E3",
    },
  });

  if (Array.isArray(body.courseIds) && body.courseIds.length > 0) {
    await prisma.trainingTrackCourse.createMany({
      data: body.courseIds.map((courseId: string, i: number) => ({ trackId: track.id, courseId, order: i })),
    });
  }

  return NextResponse.json({ track });
}
