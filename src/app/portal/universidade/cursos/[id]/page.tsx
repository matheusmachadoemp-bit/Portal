import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { canManageUsers } from "@/lib/permissions";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { courseEmpresaWhere, courseStatusWhere } from "@/lib/university-server";
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

  const isAdmin = canManageUsers(session.user.role);
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  // Curso fora do escopo de loja (achado de auditoria de segurança, tarefa #312) OU em
  // RASCUNHO/ARQUIVADO pra quem não pode gerenciar cursos (tarefa #317 — achado do Teulis, na
  // revisão da #315): as duas condições ficam no MESMO `findFirst` (em vez de buscar o curso e só
  // depois checar), pra garantir que um usuário comum sem acesso ao rascunho nunca chegue nem a
  // carregar o conteúdo completo da aula (videoUrl/pdfUrl/content) nem a passar pelo
  // `trainingEnrollment.upsert` logo abaixo — antes desta correção, visitar a URL do player de um
  // curso em RASCUNHO já criava uma matrícula de verdade pra qualquer colaborador, sem repetir a
  // checagem equivalente que `POST /api/university/enroll` já tem (`blockDraftForSelf`). Mesmo
  // tratamento de "não encontrado" tanto pra id inexistente quanto pra curso fora do escopo —
  // igual já era feito só para loja, e igual `GET /api/university/courses/[id]` já faz.
  const course = await prisma.trainingCourse.findFirst({
    where: { id, ...courseEmpresaWhere(empresaIds), ...courseStatusWhere(isAdmin) },
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
