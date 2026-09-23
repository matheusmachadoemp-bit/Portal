import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { CoursesClient } from "./courses-client";
import { canManageUsers } from "@/lib/permissions";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { courseEmpresaWhere, courseStatusWhere } from "@/lib/university-server";

export default async function CursosPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "universidade", "canView"))) {
    redirect("/portal/inicio");
  }
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const isAdmin = canManageUsers(session.user.role);

  // Gate de contexto desta página é mais permissivo que o padrão "só modo loja única" usado em
  // outros módulos (libera tanto "single" quanto "grupo" pra poder criar curso, só nunca fica
  // undefined) — mantido como estava. O que faltava (achado de auditoria de segurança, tarefa
  // #315, revisão do Teulis) era o próprio `findMany` abaixo respeitar a loja ativa: cursos SÃO
  // por loja quando `empresaId` está preenchido — só são compartilhados quando fica `null`, mesmo
  // padrão de Ficha Técnica/Combos (ver `courseEmpresaWhere`, `@/lib/university-server`). Sem
  // isso, esta página buscava e serializava no RSC/HTML TODOS os cursos de TODAS as lojas
  // (inclusive em RASCUNHO) pra qualquer colaborador logado — o filtro em `courses-client.tsx`
  // (status/categoria/busca) é só de exibição client-side, nunca foi (e não deveria ser) proteção
  // de dado.
  const canManageUniversidade = await hasModulePermission(session.user.id, "universidade", "canCreate");
  const canCreate = (ctx?.mode === "single" || ctx?.mode === "grupo") && canManageUniversidade;

  const [courses, myEnrollments, empresas] = await Promise.all([
    prisma.trainingCourse.findMany({
      // RASCUNHO/ARQUIVADO só trafegam pro payload de quem pode gerenciar (`courseStatusWhere`,
      // extraída na #317 a partir do que já era feito aqui à mão) — antes da correção original
      // (#315), o array completo (inclusive rascunhos) já saía serializado no HTML/RSC inicial pra
      // qualquer colaborador, só escondido do card por `courses-client.tsx`, nunca do payload em si.
      where: { ...courseEmpresaWhere(empresaIds), ...courseStatusWhere(isAdmin) },
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
        isAdmin={isAdmin}
        empresas={empresas}
        canCreate={canCreate}
      />
    </PageContainer>
  );
}
