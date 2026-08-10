import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { PlayerClient } from "./player-client";

export default async function CoursePlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const course = await prisma.trainingCourse.findUnique({
    where: { id },
    include: {
      modules: { orderBy: { order: "asc" } },
      quiz: { include: { questions: { include: { options: true }, orderBy: { order: "asc" } } } },
    },
  });
  if (!course) redirect("/portal/universidade/cursos");

  const enrollment = await prisma.trainingEnrollment.upsert({
    where: { userId_courseId: { userId: session.user.id, courseId: id } },
    update: {},
    create: { userId: session.user.id, courseId: id },
    include: { moduleProgress: true, certificate: true, attempts: { orderBy: { attemptNumber: "desc" } } },
  });

  const sanitizedQuiz = course.quiz
    ? {
        ...course.quiz,
        questions: course.quiz.questions.map((q) => ({
          ...q,
          options: q.options.map((o) => ({ ...o, correct: false })),
        })),
      }
    : null;

  return (
    <PageContainer title={course.name} subtitle="Videoaula">
      <PlayerClient
        course={{ ...course, quiz: sanitizedQuiz } as never}
        enrollment={{
          id: enrollment.id,
          status: enrollment.status,
          progressPercent: enrollment.progressPercent,
          certificateCode: enrollment.certificate?.code ?? null,
          attemptsUsed: enrollment.attempts.length,
        }}
        moduleProgress={enrollment.moduleProgress.map((p) => ({
          moduleId: p.moduleId,
          percentWatched: p.percentWatched,
          completed: p.completed,
        }))}
      />
    </PageContainer>
  );
}
