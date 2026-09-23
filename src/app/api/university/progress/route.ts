import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MIN_WATCH_PERCENT_TO_COMPLETE } from "@/lib/university";
import { getOrCreateModuleEnrollment, recalcModuleEnrollmentProgress } from "@/lib/university-server";

// Campo do corpo renomeado de "moduleId" pra "lessonId" nesta fase: o que
// antes era chamado de "módulo" (o vídeo/pdf/checklist/link individual) agora
// é "aula" (TrainingLesson) — "módulo" passou a ser o nível novo que agrupa
// aulas. A tela (player-client.tsx) já foi atualizada nesta própria Fase 2 e
// já envia "lessonId" corretamente.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const lessonId: string = body.lessonId;
  const deltaSeconds: number = Math.max(0, Math.round(Number(body.deltaSeconds) || 0));
  const device: string = body.device || "desktop";
  const started: boolean = !!body.started;

  const lesson = await prisma.trainingLesson.findUnique({ where: { id: lessonId }, include: { module: true } });
  if (!lesson) return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });

  // Curso fora do escopo de loja do usuário (achado de auditoria de segurança, tarefa #312): sem
  // essa checagem, bastava saber o id de uma aula de outra loja para matricular-se e registrar
  // progresso nela por tabela, mesmo sem o curso nunca aparecer na listagem do usuário.
  const enrollmentResult = await getOrCreateModuleEnrollment(session.user.id, lesson.module.courseId, lesson.moduleId);
  if (!enrollmentResult) {
    return NextResponse.json({ error: "Este curso não está disponível para a sua loja." }, { status: 403 });
  }
  const { moduleEnrollment } = enrollmentResult;

  const existing = await prisma.trainingLessonProgress.findUnique({
    where: { moduleEnrollmentId_lessonId: { moduleEnrollmentId: moduleEnrollment.id, lessonId } },
  });

  const watchedSeconds = Math.min(
    lesson.durationSeconds || Number.MAX_SAFE_INTEGER,
    (existing?.watchedSeconds ?? 0) + deltaSeconds
  );
  const percentWatched = lesson.durationSeconds
    ? Math.min(100, Math.round((watchedSeconds / lesson.durationSeconds) * 100))
    : deltaSeconds > 0
      ? 100
      : 0;
  const completed = percentWatched >= MIN_WATCH_PERCENT_TO_COMPLETE || existing?.completed || false;

  const progress = await prisma.trainingLessonProgress.upsert({
    where: { moduleEnrollmentId_lessonId: { moduleEnrollmentId: moduleEnrollment.id, lessonId } },
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
      moduleEnrollmentId: moduleEnrollment.id,
      lessonId,
      watchedSeconds,
      percentWatched,
      completed,
      startedAt: new Date(),
      completedAt: completed ? new Date() : null,
      lastDevice: device,
      playCount: started ? 1 : 0,
    },
  });

  const recalced = await recalcModuleEnrollmentProgress(moduleEnrollment.id);

  return NextResponse.json({ progress, moduleEnrollment: recalced });
}
