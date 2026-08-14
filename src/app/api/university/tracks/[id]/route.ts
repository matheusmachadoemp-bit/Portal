import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/permissions";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para editar trilhas." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.trainingTrack.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  const strFields = ["name", "cargo", "empresaId", "description", "icon", "color"] as const;
  for (const f of strFields) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  if (body.active !== undefined) data.active = !!body.active;

  if (Object.keys(data).length > 0) {
    await prisma.trainingTrack.update({ where: { id }, data });
  }

  if (Array.isArray(body.courseIds)) {
    await prisma.trainingTrackCourse.deleteMany({ where: { trackId: id } });
    if (body.courseIds.length > 0) {
      await prisma.trainingTrackCourse.createMany({
        data: body.courseIds.map((courseId: string, i: number) => ({ trackId: id, courseId, order: i })),
      });
    }
  }

  const track = await prisma.trainingTrack.findUnique({
    where: { id },
    include: { courses: { orderBy: { order: "asc" }, include: { course: true } } },
  });

  return NextResponse.json({ track });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para excluir trilhas." }, { status: 403 });
  }
  const { id } = await params;
  await prisma.trainingTrack.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
