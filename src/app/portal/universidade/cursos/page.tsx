import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PageContainer } from "@/components/page-container";
import { CoursesClient } from "./courses-client";
import { canManageUsers } from "@/lib/permissions";
import { getActiveEmpresaContext } from "@/lib/empresa";

export default async function CursosPage() {
  const session = await auth();
  const ctx = await getActiveEmpresaContext();

  const [courses, myEnrollments, empresas] = await Promise.all([
    prisma.trainingCourse.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        modules: { select: { id: true, durationSeconds: true } },
        quiz: { select: { id: true } },
        empresa: { select: { name: true } },
        _count: { select: { enrollments: true } },
      },
    }),
    session?.user
      ? prisma.trainingEnrollment.findMany({ where: { userId: session.user.id } })
      : Promise.resolve([]),
    prisma.empresa.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { order: "asc" } }),
  ]);

  const serialized = courses.map((c) => ({
    ...c,
    totalMinutes: Math.round(c.modules.reduce((a, m) => a + m.durationSeconds, 0) / 60),
    hasQuiz: !!c.quiz,
  }));

  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Cursos">
      <CoursesClient
        initialCourses={serialized as never}
        myEnrollments={myEnrollments.map((e) => ({ courseId: e.courseId, status: e.status, progressPercent: e.progressPercent }))}
        isAdmin={session ? canManageUsers(session.user.role) : false}
        empresas={empresas}
        canCreate={ctx?.mode === "single" || ctx?.mode === "grupo"}
      />
    </PageContainer>
  );
}
