import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MIN_WATCH_PERCENT_TO_COMPLETE } from "@/lib/university";
import { recalcEnrollmentProgress } from "@/lib/university-server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const moduleId: string = body.moduleId;
  const deltaSeconds: number = Math.max(0, Math.round(Number(body.deltaSeconds) || 0));
  const device: string = body.device || "desktop";
  const started: boolean = !!body.started;

  const trainingModule = await prisma.trainingModule.findUnique({ where: { id: moduleId } });
  if (!trainingModule) return NextResponse.json({ error: "Módulo não encontrado." }, { status: 404 });

  const enrollment = await prisma.trainingEnrollment.upsert({
    where: { userId_courseId: { userId: session.user.id, courseId: trainingModule.courseId } },
    update: {},
    create: { userId: session.user.id, courseId: trainingModule.courseId },
  });

  const existing = await prisma.trainingModuleProgress.findUnique({
    where: { enrollmentId_moduleId: { enrollmentId: enrollment.id, moduleId } },
  });

  const watchedSeconds = Math.min(
    trainingModule.durationSeconds || Number.MAX_SAFE_INTEGER,
    (existing?.watchedSeconds ?? 0) + deltaSeconds
  );
  const percentWatched = trainingModule.durationSeconds
    ? Math.min(100, Math.round((watchedSeconds / trainingModule.durationSeconds) * 100))
    : deltaSeconds > 0
      ? 100
      : 0;
  const completed = percentWatched >= MIN_WATCH_PERCENT_TO_COMPLETE || existing?.completed || false;

  const progress = await prisma.trainingModuleProgress.upsert({
    where: { enrollmentId_moduleId: { enrollmentId: enrollment.id, moduleId } },
    update: {
      watchedSeconds,
      percentWatched,
      completed,
      completedAt: completed && !existing?.completed ? new Date() : existing?.completedAt,
      lastDevice: device,
      lastAccessAt: new Date(),
      playCount: started ? { increment: 1 } : undefined,
    },
    create: {
      enrollmentId: enrollment.id,
      moduleId,
      watchedSeconds,
      percentWatched,
      completed,
      startedAt: new Date(),
      completedAt: completed ? new Date() : null,
      lastDevice: device,
      playCount: started ? 1 : 0,
    },
  });

  const recalced = await recalcEnrollmentProgress(enrollment.id);

  return NextResponse.json({ progress, enrollment: recalced });
}
