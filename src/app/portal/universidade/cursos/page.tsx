import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { CoursesClient } from "./courses-client";
import { canManageUsers } from "@/lib/permissions";
import { getActiveEmpresaContext } from "@/lib/empresa";

export default async function CursosPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "universidade", "canView"))) {
    redirect("/portal/inicio");
  }
  const ctx = await getActiveEmpresaContext();
  // Cursos não são "por loja" (o cadastro é global, ver query sem filtro de
  // empresaIds abaixo) — por isso o gate de contexto aqui sempre foi mais
  // permissivo que o padrão "só modo loja única" usado nos outros módulos
  // (libera tanto "single" quanto "grupo", só nunca fica undefined). Mantido
  // como estava; a parte que faltava era combinar com a permissão real do
  // usuário — antes disso só dependia de `isAdmin` no client
  // (`courses-client.tsx`), que é global e não específico do módulo.
  const canManageUniversidade = await hasModulePermission(session.user.id, "universidade", "canCreate");
  const canCreate = (ctx?.mode === "single" || ctx?.mode === "grupo") && canManageUniversidade;

  const [courses, myEnrollments, empresas] = await Promise.all([
    prisma.trainingCourse.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        modules: {
          select: { id: true, lessons: { select: { durationSeconds: true } }, quiz: { select: { id: true } } },
        },
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
    totalMinutes: Math.round(
      c.modules.reduce((a, m) => a + m.lessons.reduce((sum, l) => sum + l.durationSeconds, 0), 0) / 60
    ),
    totalLessons: c.modules.reduce((a, m) => a + m.lessons.length, 0),
    hasQuiz: c.modules.some((m) => !!m.quiz),
  }));

  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Cursos">
      <CoursesClient
        initialCourses={serialized as never}
        myEnrollments={myEnrollments.map((e) => ({ courseId: e.courseId, status: e.status, progressPercent: e.progressPercent }))}
        isAdmin={session ? canManageUsers(session.user.role) : false}
        empresas={empresas}
        canCreate={canCreate}
      />
    </PageContainer>
  );
}
