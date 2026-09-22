import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { DashboardClient } from "./dashboard/dashboard-client";
import { canManageUsers } from "@/lib/permissions";
import { startOfMonth, endOfMonth, subMonths, subDays, format } from "date-fns";

const OVERDUE_DAYS = 7;

export default async function UniversidadePage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "universidade", "canView"))) {
    redirect("/portal/inicio");
  }

  const now = new Date();

  // Últimos 6 meses (mais antigo -> mais recente), usados tanto pra contar concluídos por mês
  // (monthlyEvolution) quanto pra disparar essas 6 contagens em paralelo com o resto — cada uma é
  // um COUNT indexável no banco, não uma varredura de toda `TrainingEnrollment` em JS.
  const monthRanges = Array.from({ length: 6 }, (_, idx) => {
    const monthDate = subMonths(now, 5 - idx);
    return { month: format(monthDate, "MM/yyyy"), from: startOfMonth(monthDate), to: endOfMonth(monthDate) };
  });

  const [
    users,
    concluidos,
    pendentes,
    progressoMedio,
    concluidosPorUsuario,
    certificates,
    horasSoma,
    mediaScore,
    courses,
    overdueEnrollments,
    xpEventsThisMonth,
    pendingAssessments,
    monthlyCounts,
  ] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    // `enrollments.findMany` (sem where nenhum) trazia TODA matrícula de todo funcionário pra
    // somar/contar em JS — cresce pra sempre a cada matrícula nova. Trocado por count/aggregate/
    // groupBy calculados no banco (ver #296): cada consulta abaixo já chega pronta.
    prisma.trainingEnrollment.count({ where: { status: "CONCLUIDO" } }),
    prisma.trainingEnrollment.count({ where: { status: { in: ["NAO_INICIADO", "EM_ANDAMENTO"] } } }),
    prisma.trainingEnrollment.aggregate({ _avg: { progressPercent: true } }),
    // Um `groupBy` só substitui tanto "quantos colaboradores distintos já concluíram algo"
    // (trainedUserIds, = número de grupos) quanto "quem concluiu mais cursos" (mostCoursesUser, =
    // primeiro grupo, já vem ordenado por contagem decrescente) — sem trazer uma linha por
    // matrícula, só uma linha por colaborador com pelo menos 1 conclusão.
    prisma.trainingEnrollment.groupBy({
      by: ["userId"],
      where: { status: "CONCLUIDO" },
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
    }),
    prisma.trainingCertificate.count(),
    prisma.trainingLessonProgress.aggregate({ _sum: { watchedSeconds: true } }),
    prisma.trainingAttempt.aggregate({ _avg: { score: true } }),
    prisma.trainingCourse.findMany({
      select: { id: true, name: true, category: true, _count: { select: { enrollments: true } } },
    }),
    prisma.trainingEnrollment.findMany({
      where: {
        status: { not: "CONCLUIDO" },
        createdAt: { lte: subDays(now, OVERDUE_DAYS) },
        course: { mandatory: true },
      },
      select: { id: true },
    }),
    prisma.trainingXpEvent.findMany({
      where: { createdAt: { gte: startOfMonth(now) } },
      include: { user: { select: { name: true } } },
    }),
    prisma.trainingAttempt.count({ where: { passed: false } }),
    Promise.all(
      monthRanges.map((r) => prisma.trainingEnrollment.count({ where: { completedAt: { gte: r.from, lte: r.to } } }))
    ),
  ]);

  const horasRealizadas = Math.round((horasSoma._sum.watchedSeconds ?? 0) / 3600);
  const mediaConclusao = Math.round(progressoMedio._avg.progressPercent ?? 0);
  const mediaAvaliacoes = Math.round(mediaScore._avg.score ?? 0);

  const topCourses = [...courses]
    .sort((a, b) => b._count.enrollments - a._count.enrollments)
    .slice(0, 6)
    .map((c) => ({ name: c.name, matriculas: c._count.enrollments }));

  const categoryMap = new Map<string, number>();
  for (const c of courses) {
    const cat = c.category ?? "Outros";
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + c._count.enrollments);
  }
  const byCategory = [...categoryMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const monthlyEvolution = monthRanges.map((r, idx) => ({ month: r.month, concluidos: monthlyCounts[idx] }));

  const xpByUser = new Map<string, { name: string; xp: number }>();
  for (const ev of xpEventsThisMonth) {
    const cur = xpByUser.get(ev.userId) ?? { name: ev.user.name, xp: 0 };
    cur.xp += ev.amount;
    xpByUser.set(ev.userId, cur);
  }
  const topPerformer = [...xpByUser.values()].sort((a, b) => b.xp - a.xp)[0] ?? null;

  const topByCursos = concluidosPorUsuario[0] ?? null;
  const mostCoursesUserName = topByCursos
    ? (await prisma.user.findUnique({ where: { id: topByCursos.userId }, select: { name: true } }))?.name ?? null
    : null;

  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Treinamento corporativo e videoaulas">
      <DashboardClient
        isAdmin={session ? canManageUsers(session.user.role) : false}
        colaboradoresCadastrados={users}
        colaboradoresTreinados={concluidosPorUsuario.length}
        cursosConcluidos={concluidos}
        cursosPendentes={pendentes}
        horasRealizadas={horasRealizadas}
        mediaConclusao={mediaConclusao}
        mediaAvaliacoes={mediaAvaliacoes}
        certificadosEmitidos={certificates}
        topCourses={topCourses}
        byCategory={byCategory}
        monthlyEvolution={monthlyEvolution}
        atrasados={overdueEnrollments.length}
        avaliacoesPendentes={pendingAssessments}
        topPerformer={topPerformer}
        mostCoursesUserName={mostCoursesUserName}
        mostCoursesCount={topByCursos?._count.userId ?? 0}
      />
    </PageContainer>
  );
}
