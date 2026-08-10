import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { DashboardClient } from "./dashboard-client";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

export default async function UniversidadeDashboardPage() {
  const now = new Date();

  const [users, enrollments, certificates, moduleProgress, attempts, courses] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.trainingEnrollment.findMany({ include: { course: { select: { name: true } } } }),
    prisma.trainingCertificate.count(),
    prisma.trainingModuleProgress.findMany({ select: { watchedSeconds: true } }),
    prisma.trainingAttempt.findMany({ select: { score: true } }),
    prisma.trainingCourse.findMany({
      select: { id: true, name: true, category: true, _count: { select: { enrollments: true } } },
    }),
  ]);

  const trainedUserIds = new Set(enrollments.filter((e) => e.status === "CONCLUIDO").map((e) => e.userId));
  const concluidos = enrollments.filter((e) => e.status === "CONCLUIDO").length;
  const pendentes = enrollments.filter((e) => e.status === "NAO_INICIADO" || e.status === "EM_ANDAMENTO").length;
  const horasRealizadas = Math.round(moduleProgress.reduce((a, p) => a + p.watchedSeconds, 0) / 3600);
  const mediaConclusao = enrollments.length
    ? Math.round(enrollments.reduce((a, e) => a + e.progressPercent, 0) / enrollments.length)
    : 0;
  const mediaAvaliacoes = attempts.length ? Math.round(attempts.reduce((a, at) => a + at.score, 0) / attempts.length) : 0;

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

  const monthlyEvolution: { month: string; concluidos: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    const from = startOfMonth(monthDate);
    const to = endOfMonth(monthDate);
    const count = enrollments.filter((e) => e.completedAt && e.completedAt >= from && e.completedAt <= to).length;
    monthlyEvolution.push({ month: format(monthDate, "MM/yyyy"), concluidos: count });
  }

  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Treinamento corporativo e videoaulas">
      <DashboardClient
        colaboradoresCadastrados={users}
        colaboradoresTreinados={trainedUserIds.size}
        cursosConcluidos={concluidos}
        cursosPendentes={pendentes}
        horasRealizadas={horasRealizadas}
        mediaConclusao={mediaConclusao}
        mediaAvaliacoes={mediaAvaliacoes}
        certificadosEmitidos={certificates}
        topCourses={topCourses}
        byCategory={byCategory}
        monthlyEvolution={monthlyEvolution}
      />
    </PageContainer>
  );
}
