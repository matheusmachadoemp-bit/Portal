import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { DashboardClient } from "./dashboard/dashboard-client";
import { canManageUsers } from "@/lib/permissions";
import { activeUserInEmpresasWhere, empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { courseEmpresaWhere, courseStatusWhere } from "@/lib/university-server";
import { startOfMonth, endOfMonth, subMonths, subDays, format } from "date-fns";

const OVERDUE_DAYS = 7;

export default async function UniversidadePage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "universidade", "canView"))) {
    redirect("/portal/inicio");
  }

  const isAdmin = canManageUsers(session.user.role);
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  // Sem contexto de loja resolvido (ex.: usuário sem nenhum acesso), nenhuma das métricas abaixo
  // que são escopadas por USUÁRIO (em vez de por CURSO) deve recair no fallback de
  // `activeUserInEmpresasWhere` que deixaria ADMINISTRADOR/GESTOR passar mesmo com lista vazia —
  // mesmo guard que `getSelectableTeamMembers` (src/lib/empresa.ts) já aplica.
  const hasEmpresaContext = empresaIds.length > 0;

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
    // Escopado por USUÁRIO (não por curso): "colaboradores cadastrados" é contagem de `User`
    // (login no Portal), então usa o mesmo filtro de "tem acesso a pelo menos uma destas lojas"
    // já usado por RH/Checklist pra listas de usuário por loja (`activeUserInEmpresasWhere`),
    // não `courseEmpresaWhere` (esse é só pra filtrar `TrainingCourse`). Até a correção deste
    // item (#investigação base única de pessoas), contava a rede inteira sem filtro nenhum.
    hasEmpresaContext ? prisma.user.count({ where: activeUserInEmpresasWhere(empresaIds) }) : Promise.resolve(0),
    // `enrollments.findMany` (sem where nenhum) trazia TODA matrícula de todo funcionário pra
    // somar/contar em JS — cresce pra sempre a cada matrícula nova. Trocado por count/aggregate/
    // groupBy calculados no banco (ver #296): cada consulta abaixo já chega pronta.
    //
    // Escopado por CURSO (`courseEmpresaWhere`) a partir deste item: cursos sem `empresaId` são
    // compartilhados entre lojas, cursos com `empresaId` só entram se a loja estiver no contexto
    // ativo — mesmo critério que `topCourses`/`byCategory` abaixo já aplicavam, agora estendido a
    // toda contagem/agregação de `TrainingEnrollment`/`TrainingCertificate`/`TrainingAttempt`/
    // `TrainingLessonProgress` deste dashboard (antes contavam a rede inteira sem filtro).
    prisma.trainingEnrollment.count({ where: { status: "CONCLUIDO", course: courseEmpresaWhere(empresaIds) } }),
    prisma.trainingEnrollment.count({
      where: { status: { in: ["NAO_INICIADO", "EM_ANDAMENTO"] }, course: courseEmpresaWhere(empresaIds) },
    }),
    prisma.trainingEnrollment.aggregate({
      _avg: { progressPercent: true },
      where: { course: courseEmpresaWhere(empresaIds) },
    }),
    // Um `groupBy` só substitui tanto "quantos colaboradores distintos já concluíram algo"
    // (trainedUserIds, = número de grupos) quanto "quem concluiu mais cursos" (mostCoursesUser, =
    // primeiro grupo, já vem ordenado por contagem decrescente) — sem trazer uma linha por
    // matrícula, só uma linha por colaborador com pelo menos 1 conclusão.
    prisma.trainingEnrollment.groupBy({
      by: ["userId"],
      where: { status: "CONCLUIDO", course: courseEmpresaWhere(empresaIds) },
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
    }),
    prisma.trainingCertificate.count({ where: { course: courseEmpresaWhere(empresaIds) } }),
    prisma.trainingLessonProgress.aggregate({
      _sum: { watchedSeconds: true },
      where: { moduleEnrollment: { enrollment: { course: courseEmpresaWhere(empresaIds) } } },
    }),
    // `_count: true` aqui (além de `_avg`) é o que permite o item 2 distinguir "nenhuma
    // TrainingAttempt no escopo" (quiz é opcional por módulo — pode não existir nenhuma tentativa
    // ainda) de "média real é 0%" — antes os dois casos chegavam como "0%" pro usuário, sem
    // diferença nenhuma na tela.
    prisma.trainingAttempt.aggregate({
      _avg: { score: true },
      _count: true,
      where: { moduleEnrollment: { enrollment: { course: courseEmpresaWhere(empresaIds) } } },
    }),
    // Filtrado por loja (`courseEmpresaWhere`, desde a #315) E status (`courseStatusWhere`, desde
    // a #317 — achado do Teulis na revisão da #315): sem o segundo, os gráficos "Cursos mais
    // concluídos"/"por categoria" abaixo agregavam nome+categoria+matrículas de cursos em
    // RASCUNHO (da própria loja ou compartilhados) pra qualquer colaborador com acesso à
    // Universidade, mesmo sem o gate de `isAdmin` que os outros cards administrativos têm.
    prisma.trainingCourse.findMany({
      where: { ...courseEmpresaWhere(empresaIds), ...courseStatusWhere(isAdmin) },
      select: { id: true, name: true, category: true, _count: { select: { enrollments: true } } },
    }),
    prisma.trainingEnrollment.findMany({
      where: {
        status: { not: "CONCLUIDO" },
        createdAt: { lte: subDays(now, OVERDUE_DAYS) },
        course: { ...courseEmpresaWhere(empresaIds), mandatory: true },
      },
      select: { id: true },
    }),
    // `TrainingXpEvent` não tem vínculo com curso nenhum (só `userId`) — escopado por USUÁRIO
    // (mesmo motivo/filtro da contagem de `users` acima), não por `courseEmpresaWhere`.
    hasEmpresaContext
      ? prisma.trainingXpEvent.findMany({
          where: { createdAt: { gte: startOfMonth(now) }, user: activeUserInEmpresasWhere(empresaIds) },
          include: { user: { select: { name: true } } },
        })
      : Promise.resolve([]),
    prisma.trainingAttempt.count({
      where: { passed: false, moduleEnrollment: { enrollment: { course: courseEmpresaWhere(empresaIds) } } },
    }),
    Promise.all(
      monthRanges.map((r) =>
        prisma.trainingEnrollment.count({
          where: { completedAt: { gte: r.from, lte: r.to }, course: courseEmpresaWhere(empresaIds) },
        })
      )
    ),
  ]);

  // Horas de treinamento: antes arredondava segundos -> HORA cheia (`/3600`) e só depois
  // reconvertia pra minuto (`* 60`) na tela — qualquer total abaixo de 30min acumulado virava
  // "0min" na exibição, mesmo com progresso real registrado. Agora arredonda direto pra minuto.
  const minutosRealizados = Math.round((horasSoma._sum.watchedSeconds ?? 0) / 60);
  const mediaConclusao = Math.round(progressoMedio._avg.progressPercent ?? 0);
  // `mediaScore._count` (não `._count.score`: é `_count: true`, não `_count: { score: true }`) é
  // o total de `TrainingAttempt` no escopo — 0 significa "nenhuma avaliação registrada ainda"
  // (quiz é opcional por módulo), bem diferente de "a média das avaliações registradas é 0%".
  // `null` sinaliza o primeiro caso pro `DashboardClient` (ver item 2).
  const mediaAvaliacoes = mediaScore._count > 0 ? Math.round(mediaScore._avg.score ?? 0) : null;

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
        isAdmin={isAdmin}
        colaboradoresCadastrados={users}
        colaboradoresTreinados={concluidosPorUsuario.length}
        cursosConcluidos={concluidos}
        cursosPendentes={pendentes}
        minutosRealizados={minutosRealizados}
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
