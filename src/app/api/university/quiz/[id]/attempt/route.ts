import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { applyModuleQuizResult } from "@/lib/university-server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: quizId } = await params;

  const quiz = await prisma.trainingQuiz.findUnique({
    where: { id: quizId },
    include: { questions: { include: { options: true } }, module: { include: { lessons: true, course: true } } },
  });
  if (!quiz) return NextResponse.json({ error: "Avaliação não encontrada." }, { status: 404 });

  const enrollment = await prisma.trainingEnrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId: quiz.module.courseId } },
  });
  if (!enrollment) return NextResponse.json({ error: "Você não está matriculado neste curso." }, { status: 403 });

  const moduleEnrollment = await prisma.trainingModuleEnrollment.findUnique({
    where: { enrollmentId_moduleId: { enrollmentId: enrollment.id, moduleId: quiz.moduleId } },
    include: { lessonProgress: true },
  });
  if (!moduleEnrollment) {
    return NextResponse.json({ error: "Você ainda não começou este módulo." }, { status: 403 });
  }

  // Regra de negócio: avaliação só depois de concluir todas as aulas do
  // módulo — já era assim no player (botão desabilitado), agora também
  // reforçado no servidor, pra não dar pra pular direto pra prova chamando a
  // rota sem passar pela tela.
  const totalLessons = quiz.module.lessons.length;
  const completedLessons = moduleEnrollment.lessonProgress.filter((p) => p.completed).length;
  if (totalLessons === 0 || completedLessons < totalLessons) {
    return NextResponse.json(
      { error: "Conclua todas as aulas do módulo antes de fazer a avaliação." },
      { status: 403 }
    );
  }

  const previousAttempts = await prisma.trainingAttempt.count({ where: { quizId, userId: session.user.id } });
  if (previousAttempts >= quiz.maxAttempts) {
    return NextResponse.json({ error: "Número máximo de tentativas atingido." }, { status: 400 });
  }

  const body = await req.json();
  const answers: { questionId: string; optionId?: string; text?: string }[] = body.answers ?? [];

  const gradable = quiz.questions.filter((q) => q.type !== "DISSERTATIVA");
  let correctCount = 0;
  for (const q of gradable) {
    const answer = answers.find((a) => a.questionId === q.id);
    const correctOption = q.options.find((o) => o.correct);
    if (answer?.optionId && correctOption && answer.optionId === correctOption.id) correctCount++;
  }
  const score = gradable.length ? Math.round((correctCount / gradable.length) * 100) : 100;
  const passed = score >= quiz.minScore;

  const attempt = await prisma.trainingAttempt.create({
    data: {
      quizId,
      moduleEnrollmentId: moduleEnrollment.id,
      userId: session.user.id,
      score,
      passed,
      answers: JSON.stringify(answers),
      attemptNumber: previousAttempts + 1,
      submittedAt: new Date(),
    },
  });

  await applyModuleQuizResult(moduleEnrollment.id, passed, score === 100);

  return NextResponse.json({ attempt });
}
