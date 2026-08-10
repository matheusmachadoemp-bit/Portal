import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/permissions";

async function enrollUserInCourse(userId: string, courseId: string) {
  const existing = await prisma.trainingEnrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (existing) return existing;
  return prisma.trainingEnrollment.create({ data: { userId, courseId } });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const targetUserId: string = body.userId || session.user.id;

  if (targetUserId !== session.user.id && !canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para matricular outros colaboradores." }, { status: 403 });
  }

  if (body.trackId) {
    const track = await prisma.trainingTrack.findUnique({
      where: { id: body.trackId },
      include: { courses: { include: { course: true } } },
    });
    if (!track) return NextResponse.json({ error: "Trilha não encontrada." }, { status: 404 });
    const enrollments = [];
    for (const tc of track.courses) {
      enrollments.push(await enrollUserInCourse(targetUserId, tc.courseId));
    }
    return NextResponse.json({ enrollments });
  }

  if (body.courseId) {
    const enrollment = await enrollUserInCourse(targetUserId, body.courseId);
    return NextResponse.json({ enrollment });
  }

  return NextResponse.json({ error: "Informe courseId ou trackId." }, { status: 400 });
}
