import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { courseAllowedForActiveEmpresa } from "@/lib/university-server";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { PlayerClient } from "./player-client";

export default async function CoursePlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await hasModulePermission(session.user.id, "universidade", "canView"))) {
    redirect("/portal/inicio");
  }

  const course = await prisma.trainingCourse.findUnique({
    where: { id },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: { orderBy: { order: "asc" } },
          quiz: { include: { questions: { include: { options: true }, orderBy: { order: "asc" } } } },
        },
      },
    },
  });
  if (!course) redirect("/portal/universidade/cursos");

  // Curso fora do escopo de loja do usuário (achado de auditoria de segurança, tarefa #312): sem
  // essa checagem, bastava conhecer/adivinhar o id de um curso de outra loja para acessar o
  // player e se auto-matricular por tabela, mesmo esse curso nunca aparecendo na listagem do
  // usuário (GET /api/university/courses já aplica esse mesmo filtro). Mesmo tratamento de "não
  // acessível" que o curso inexistente logo acima.
  if (!(await courseAllowedForActiveEmpresa(course.empresaId))) {
    redirect("/portal/universidade/cursos");
  }

  const enrollment = await prisma.trainingEnrollment.upsert({
    where: { userId_courseId: { userId: session.user.id, courseId: id } },
    update: {},
    create: { userId: session.user.id, courseId: id },
    include: {
      moduleEnrollments: {
        include: { lessonProgress: true, certificate: true, attempts: true },
      },
    },
  });

  const sanitizedModules = course.modules.map((m) => ({
    ...m,
    quiz: m.quiz
      ? {
          ...m.quiz,
          questions: m.quiz.questions.map((q) => ({
            ...q,
            options: q.options.map((o) => ({ ...o, correct: false })),
          })),
        }
      : null,
  }));

  const moduleEnrollments = enrollment.moduleEnrollments.map((me) => ({
    moduleId: me.moduleId,
    status: me.status,
    certificateCode: me.certificate?.code ?? null,
    attemptsUsed: me.attempts.length,
  }));

  const lessonProgress = enrollment.moduleEnrollments.flatMap((me) =>
    me.lessonProgress.map((p) => ({ lessonId: p.lessonId, percentWatched: p.percentWatched, completed: p.completed }))
  );

  return (
    <PageContainer title={course.name} subtitle="Videoaula" backHref="/portal/universidade/cursos" backLabel="Voltar para cursos">
      <PlayerClient
        course={{ ...course, modules: sanitizedModules } as never}
        enrollment={{ id: enrollment.id, status: enrollment.status }}
        moduleEnrollments={moduleEnrollments}
        lessonProgress={lessonProgress}
      />
    </PageContainer>
  );
}
