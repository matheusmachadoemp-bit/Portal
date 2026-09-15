import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { XP_RULES } from "@/lib/university";

// ---------------------------------------------------------------------------
// Hierarquia (a partir de set/2026): Curso -> Módulo -> Aula. Matrícula
// continua no grão do CURSO (TrainingEnrollment, o que o colaborador
// escolhe); progresso/avaliação/certificado passaram a ser no grão do
// MÓDULO (TrainingModuleEnrollment) — ver
// prisma/migrations/20260915130000_universidade_curso_modulo_aula.
//
// Regra de certificado confirmada: um módulo SEM avaliação cadastrada (sem
// TrainingQuiz, ou com TrainingQuiz sem nenhuma TrainingQuestion) conclui
// normalmente assistindo todas as aulas, mas NUNCA emite certificado — só
// depois que um admin cadastrar pelo menos 1 pergunta de verdade. Um módulo
// COM avaliação só conclui (e só emite certificado) depois de aprovado nela.
// ---------------------------------------------------------------------------

export function generateCertificateCode(): string {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

export async function awardXp(userId: string, amount: number, reason: string) {
  await prisma.trainingXpEvent.create({ data: { userId, amount, reason } });
}

/**
 * Garante que exista a matrícula do curso (grão curso) e a matrícula do
 * módulo (grão módulo) do colaborador — criadas sob demanda, na primeira vez
 * que ele interage com alguma aula daquele módulo. Usado por
 * POST /api/university/progress antes de registrar o progresso da aula.
 */
export async function getOrCreateModuleEnrollment(userId: string, courseId: string, moduleId: string) {
  const enrollment = await prisma.trainingEnrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: {},
    create: { userId, courseId },
  });

  const moduleEnrollment = await prisma.trainingModuleEnrollment.upsert({
    where: { enrollmentId_moduleId: { enrollmentId: enrollment.id, moduleId } },
    update: {},
    create: { enrollmentId: enrollment.id, moduleId },
  });

  return { enrollment, moduleEnrollment };
}

/**
 * Recalcula o progresso de uma matrícula-por-módulo a partir das aulas
 * concluídas e, quando aplicável (módulo sem avaliação cadastrada), marca
 * como concluído e tenta emitir o certificado. Sempre recalcula também a
 * matrícula-por-curso (agregada) em seguida, já que o progresso de um módulo
 * afeta o do curso como um todo.
 */
export async function recalcModuleEnrollmentProgress(moduleEnrollmentId: string) {
  const moduleEnrollment = await prisma.trainingModuleEnrollment.findUnique({
    where: { id: moduleEnrollmentId },
    include: {
      module: { include: { lessons: true, quiz: { include: { questions: true } } } },
      lessonProgress: true,
      certificate: true,
    },
  });
  if (!moduleEnrollment) return null;

  const totalLessons = moduleEnrollment.module.lessons.length;
  const completedLessons = moduleEnrollment.lessonProgress.filter((p) => p.completed).length;
  const progressPercent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const allLessonsDone = totalLessons > 0 && completedLessons === totalLessons;
  // "Avaliação de verdade" exige pelo menos 1 pergunta cadastrada — um
  // TrainingQuiz vazio (criado mas ainda sem pergunta) não bloqueia nem
  // libera certificado sozinho, já que não daria pra "acertar 90%" de nada.
  const hasRealQuiz = !!moduleEnrollment.module.quiz && moduleEnrollment.module.quiz.questions.length > 0;

  let status = moduleEnrollment.status;
  if (progressPercent > 0 && status === "NAO_INICIADO") status = "EM_ANDAMENTO";

  let completedAt = moduleEnrollment.completedAt;

  // Só conclui automaticamente aqui quando NÃO há avaliação de verdade —
  // módulo com avaliação só conclui via applyModuleQuizResult, depois de
  // aprovado (mesmo padrão que o curso inteiro já seguia antes desta fase).
  if (allLessonsDone && !hasRealQuiz && status !== "CONCLUIDO") {
    status = "CONCLUIDO";
    completedAt = new Date();
  }

  await prisma.trainingModuleEnrollment.update({
    where: { id: moduleEnrollmentId },
    data: { progressPercent, status, completedAt, startedAt: moduleEnrollment.startedAt ?? new Date() },
  });

  if (status === "CONCLUIDO" && !moduleEnrollment.certificate) {
    await issueModuleCertificateIfNeeded(moduleEnrollmentId);
  }

  await recalcCourseEnrollmentProgress(moduleEnrollment.enrollmentId);

  return { progressPercent, status };
}

/**
 * Emite o certificado de um módulo, se ainda não existir E o módulo tiver
 * avaliação cadastrada com pelo menos 1 pergunta (regra confirmada: sem
 * avaliação de verdade, o módulo pode concluir mas nunca certifica). Chamada
 * tanto por recalcModuleEnrollmentProgress (módulo sem avaliação, que nunca
 * de fato emite — só existe pra manter a checagem num lugar só) quanto por
 * applyModuleQuizResult (módulo com avaliação aprovada).
 */
export async function issueModuleCertificateIfNeeded(moduleEnrollmentId: string) {
  const moduleEnrollment = await prisma.trainingModuleEnrollment.findUnique({
    where: { id: moduleEnrollmentId },
    include: {
      module: { include: { quiz: { include: { questions: true } } } },
      enrollment: { select: { userId: true } },
      certificate: true,
    },
  });
  if (!moduleEnrollment || moduleEnrollment.certificate || moduleEnrollment.status !== "CONCLUIDO") return;

  const quiz = moduleEnrollment.module.quiz;
  if (!quiz || quiz.questions.length === 0) return;

  await prisma.trainingCertificate.create({
    data: {
      code: generateCertificateCode(),
      userId: moduleEnrollment.enrollment.userId,
      courseId: moduleEnrollment.module.courseId,
      moduleId: moduleEnrollment.moduleId,
      moduleEnrollmentId: moduleEnrollment.id,
      cargaHoraria: moduleEnrollment.module.cargaHoraria,
    },
  });

  await awardXp(
    moduleEnrollment.enrollment.userId,
    XP_RULES.MODULE_COMPLETED,
    `Módulo concluído: ${moduleEnrollment.module.title}`
  );
}

/**
 * Após uma tentativa de avaliação de um módulo: registra o resultado e, se
 * aprovado (nota >= minScore do módulo — regra de negócio: default 90%,
 * editável por módulo), conclui a matrícula do módulo (emite certificado e
 * XP); se reprovado, marca REPROVADO (o colaborador pode tentar de novo, até
 * o limite de tentativas do módulo). Sempre recalcula a matrícula do curso em
 * seguida.
 */
export async function applyModuleQuizResult(moduleEnrollmentId: string, passed: boolean, perfectScore: boolean) {
  const moduleEnrollment = await prisma.trainingModuleEnrollment.findUnique({
    where: { id: moduleEnrollmentId },
    include: {
      module: { include: { quiz: { include: { questions: true } } } },
      certificate: true,
      enrollment: { select: { userId: true } },
    },
  });
  if (!moduleEnrollment) return;

  // Mesma checagem de "avaliação de verdade" (≥1 pergunta) usada em
  // issueModuleCertificateIfNeeded: sem ela, um quiz vazio sempre "acerta
  // 100%" (score = gradable.length ? ... : 100 em
  // quiz/[id]/attempt/route.ts) e premiaria XP de nota máxima de graça,
  // repetidamente, mesmo nunca emitindo certificado.
  const hasRealQuiz = !!moduleEnrollment.module.quiz && moduleEnrollment.module.quiz.questions.length > 0;

  if (passed) {
    await prisma.trainingModuleEnrollment.update({
      where: { id: moduleEnrollmentId },
      data: { status: "CONCLUIDO", completedAt: new Date() },
    });
    if (!moduleEnrollment.certificate) await issueModuleCertificateIfNeeded(moduleEnrollmentId);
    if (perfectScore && hasRealQuiz) {
      await awardXp(
        moduleEnrollment.enrollment.userId,
        XP_RULES.QUIZ_PERFECT_SCORE,
        `Nota máxima: ${moduleEnrollment.module.title}`
      );
    }
  } else {
    await prisma.trainingModuleEnrollment.update({
      where: { id: moduleEnrollmentId },
      data: { status: "REPROVADO" },
    });
  }

  await recalcCourseEnrollmentProgress(moduleEnrollment.enrollmentId);
}

/**
 * Recalcula a matrícula do CURSO (agregada) a partir de todas as
 * matrículas-por-módulo já existentes daquele colaborador. Um módulo que o
 * colaborador ainda nem abriu não tem TrainingModuleEnrollment nenhuma
 * (criada sob demanda — ver getOrCreateModuleEnrollment) e por isso conta
 * como 0%/não iniciado na média, exatamente como se tivesse uma linha com
 * progressPercent 0.
 *
 * status do curso nunca vira REPROVADO (isso só faz sentido no grão do
 * módulo, vinculado a uma avaliação específica) — no curso, só
 * NAO_INICIADO / EM_ANDAMENTO / CONCLUIDO (todos os módulos concluídos).
 */
export async function recalcCourseEnrollmentProgress(enrollmentId: string) {
  const enrollment = await prisma.trainingEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: { include: { modules: { select: { id: true } } } },
      moduleEnrollments: { select: { status: true, progressPercent: true } },
    },
  });
  if (!enrollment) return null;

  const totalModules = enrollment.course.modules.length;
  const { moduleEnrollments } = enrollment;

  const progressPercent = totalModules
    ? Math.round(moduleEnrollments.reduce((sum, m) => sum + m.progressPercent, 0) / totalModules)
    : 0;

  const startedCount = moduleEnrollments.filter((m) => m.status !== "NAO_INICIADO").length;
  const concludedCount = moduleEnrollments.filter((m) => m.status === "CONCLUIDO").length;

  let status: "NAO_INICIADO" | "EM_ANDAMENTO" | "CONCLUIDO";
  if (totalModules > 0 && concludedCount === totalModules) {
    status = "CONCLUIDO";
  } else if (startedCount > 0) {
    status = "EM_ANDAMENTO";
  } else {
    status = "NAO_INICIADO";
  }

  await prisma.trainingEnrollment.update({
    where: { id: enrollmentId },
    data: {
      progressPercent,
      status,
      startedAt: status !== "NAO_INICIADO" ? (enrollment.startedAt ?? new Date()) : enrollment.startedAt,
      completedAt: status === "CONCLUIDO" ? (enrollment.completedAt ?? new Date()) : null,
    },
  });

  return { progressPercent, status };
}
