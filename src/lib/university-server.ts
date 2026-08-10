import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { XP_RULES } from "@/lib/university";

export function generateCertificateCode(): string {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

export async function awardXp(userId: string, amount: number, reason: string) {
  await prisma.trainingXpEvent.create({ data: { userId, amount, reason } });
}

/**
 * Recalcula o progresso de uma matrícula a partir dos módulos concluídos e,
 * quando aplicável, marca como concluída (emitindo certificado e XP) ou
 * mantém pendente de avaliação.
 */
export async function recalcEnrollmentProgress(enrollmentId: string) {
  const enrollment = await prisma.trainingEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: { include: { modules: true, quiz: true } },
      moduleProgress: true,
      certificate: true,
    },
  });
  if (!enrollment) return null;

  const totalModules = enrollment.course.modules.length;
  const completedModules = enrollment.moduleProgress.filter((p) => p.completed).length;
  const progressPercent = totalModules ? Math.round((completedModules / totalModules) * 100) : 0;

  const allModulesDone = totalModules > 0 && completedModules === totalModules;
  const hasQuiz = !!enrollment.course.quiz;

  let status = enrollment.status;
  if (progressPercent > 0 && status === "NAO_INICIADO") status = "EM_ANDAMENTO";

  let completedAt = enrollment.completedAt;

  if (allModulesDone && !hasQuiz && status !== "CONCLUIDO") {
    status = "CONCLUIDO";
    completedAt = new Date();
  }

  await prisma.trainingEnrollment.update({
    where: { id: enrollmentId },
    data: { progressPercent, status, completedAt, startedAt: enrollment.startedAt ?? new Date() },
  });

  if (status === "CONCLUIDO" && !enrollment.certificate) {
    await issueCertificateIfNeeded(enrollmentId);
  }

  return { progressPercent, status };
}

export async function issueCertificateIfNeeded(enrollmentId: string) {
  const enrollment = await prisma.trainingEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: true, certificate: true },
  });
  if (!enrollment || enrollment.certificate || enrollment.status !== "CONCLUIDO") return;

  await prisma.trainingCertificate.create({
    data: {
      code: generateCertificateCode(),
      userId: enrollment.userId,
      courseId: enrollment.courseId,
      enrollmentId: enrollment.id,
      cargaHoraria: enrollment.course.cargaHoraria,
    },
  });

  await awardXp(enrollment.userId, XP_RULES.COURSE_COMPLETED, `Curso concluído: ${enrollment.course.name}`);
}

/**
 * Após uma tentativa de avaliação: registra o resultado e, se aprovado,
 * conclui a matrícula (gera certificado e XP); se reprovado, exige assistir
 * novamente o curso (volta o status para em andamento).
 */
export async function applyQuizResult(enrollmentId: string, passed: boolean, perfectScore: boolean) {
  const enrollment = await prisma.trainingEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: true, certificate: true },
  });
  if (!enrollment) return;

  if (passed) {
    await prisma.trainingEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "CONCLUIDO", completedAt: new Date() },
    });
    if (!enrollment.certificate) await issueCertificateIfNeeded(enrollmentId);
    if (perfectScore) {
      await awardXp(enrollment.userId, XP_RULES.QUIZ_PERFECT_SCORE, `Nota máxima: ${enrollment.course.name}`);
    }
  } else {
    await prisma.trainingEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "REPROVADO" },
    });
  }
}
