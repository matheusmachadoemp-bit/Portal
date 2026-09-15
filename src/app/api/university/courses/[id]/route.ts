import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/permissions";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "universidade", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Universidade." }, { status: 403 });
  }
  const { id } = await params;

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const course = await prisma.trainingCourse.findFirst({
    where: { id, OR: [{ empresaId: null }, { empresaId: { in: empresaIds } }] },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: { orderBy: { order: "asc" } },
          quiz: { include: { questions: { include: { options: true }, orderBy: { order: "asc" } } } },
        },
      },
      empresa: { select: { name: true } },
    },
  });
  if (!course) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  if (!canManageUsers(session.user.role)) {
    for (const m of course.modules) {
      if (m.quiz) {
        m.quiz.questions = m.quiz.questions.map((q) => ({
          ...q,
          options: q.options.map((o) => ({ ...o, correct: false })),
        }));
      }
    }
  }

  return NextResponse.json({ course });
}

type LessonInput = {
  id?: string;
  title: string;
  type: string;
  videoUrl?: string;
  durationSeconds?: number;
  pdfUrl?: string;
  content?: string;
};

type QuizInput = {
  minScore?: number;
  maxAttempts?: number;
  timeLimitMinutes?: number | null;
  questions: {
    text: string;
    type: string;
    options: { text: string; correct: boolean }[];
  }[];
};

type ModuleInput = {
  id?: string;
  title: string;
  description?: string;
  cargaHoraria?: number;
  lessons?: LessonInput[];
  quiz?: QuizInput | null;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para editar cursos." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "universidade", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar cursos." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const existing = await prisma.trainingCourse.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const body = await req.json();

  const data: Record<string, unknown> = {};
  const strFields = ["name", "category", "description", "cargo", "empresaId", "imageUrl", "instructor", "status"] as const;
  for (const f of strFields) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  if (body.cargaHoraria !== undefined) data.cargaHoraria = Number(body.cargaHoraria) || 0;
  if (body.mandatory !== undefined) data.mandatory = !!body.mandatory;
  if (body.modules !== undefined) data.version = { increment: 1 };

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.trainingCourse.update({ where: { id }, data });
      }

      if (!Array.isArray(body.modules)) return;

      const modulesInput = body.modules as ModuleInput[];
      const existingModules = await tx.trainingModule.findMany({ where: { courseId: id }, select: { id: true } });
      const keepModuleIds = new Set(modulesInput.filter((m) => m.id).map((m) => m.id as string));

      // Remove módulos que saíram do payload — mas nunca um que já tenha
      // certificado emitido (colaborador já concluiu de verdade), nem um com
      // progresso real de algum colaborador (aula assistida, tentativa de
      // avaliação registrada, mesmo reprovada). Nesses casos avisa com um erro
      // claro em vez de apagar tudo silenciosamente: as FKs de
      // TrainingModuleEnrollment/TrainingLessonProgress/TrainingAttempt são
      // ON DELETE CASCADE a partir do módulo (diferente de TrainingCertificate,
      // que é RESTRICT), então sem essa checagem a exclusão do módulo não
      // falharia sozinha — só apagaria o progresso sem avisar ninguém.
      // TrainingLessonProgress e TrainingAttempt sempre pendem de uma
      // TrainingModuleEnrollment (não existe uma sem a outra), então checar a
      // matrícula-por-módulo já cobre os três casos.
      const modulesToRemove = existingModules.filter((m) => !keepModuleIds.has(m.id));
      if (modulesToRemove.length > 0) {
        const moduleIdsToRemove = modulesToRemove.map((m) => m.id);
        const withCertificates = await tx.trainingCertificate.count({
          where: { moduleId: { in: moduleIdsToRemove } },
        });
        if (withCertificates > 0) {
          throw new Error("Não é possível remover um módulo que já tem certificado emitido para algum colaborador.");
        }
        const withProgress = await tx.trainingModuleEnrollment.count({
          where: { moduleId: { in: moduleIdsToRemove } },
        });
        if (withProgress > 0) {
          throw new Error(
            "Não é possível remover um módulo com progresso registrado de algum colaborador (aula assistida ou avaliação respondida)."
          );
        }
        await tx.trainingModule.deleteMany({ where: { id: { in: moduleIdsToRemove } } });
      }

      for (let i = 0; i < modulesInput.length; i++) {
        const m = modulesInput[i];
        const isExistingModule = !!m.id && existingModules.some((em) => em.id === m.id);
        const moduleData = {
          title: m.title,
          description: m.description || null,
          cargaHoraria: Number(m.cargaHoraria) || 0,
          order: i,
        };

        const moduleId = isExistingModule
          ? (m.id as string)
          : (await tx.trainingModule.create({ data: { ...moduleData, courseId: id } })).id;

        if (isExistingModule) {
          await tx.trainingModule.update({ where: { id: moduleId }, data: moduleData });
        }

        // Aulas do módulo: upsert por id, remove as que saíram do payload.
        const lessonsInput = Array.isArray(m.lessons) ? m.lessons : [];
        const existingLessons = await tx.trainingLesson.findMany({ where: { moduleId }, select: { id: true } });
        const keepLessonIds = new Set(lessonsInput.filter((l) => l.id).map((l) => l.id as string));
        const lessonsToRemove = existingLessons.filter((l) => !keepLessonIds.has(l.id));
        if (lessonsToRemove.length > 0) {
          await tx.trainingLesson.deleteMany({ where: { id: { in: lessonsToRemove.map((l) => l.id) } } });
        }
        for (let j = 0; j < lessonsInput.length; j++) {
          const l = lessonsInput[j];
          const isExistingLesson = !!l.id && existingLessons.some((el) => el.id === l.id);
          const lessonData = {
            title: l.title,
            type: (l.type as never) || "VIDEO",
            videoUrl: l.videoUrl || null,
            durationSeconds: Number(l.durationSeconds) || 0,
            pdfUrl: l.pdfUrl || null,
            content: l.content || null,
            order: j,
          };
          if (isExistingLesson) {
            await tx.trainingLesson.update({ where: { id: l.id }, data: lessonData });
          } else {
            await tx.trainingLesson.create({ data: { ...lessonData, moduleId } });
          }
        }

        // Avaliação do módulo — só mexe se "quiz" veio explicitamente no
        // payload (undefined = não alterar avaliação existente).
        if (m.quiz !== undefined) {
          const existingQuiz = await tx.trainingQuiz.findUnique({ where: { moduleId } });
          const wantsQuiz = !!m.quiz && Array.isArray(m.quiz.questions) && m.quiz.questions.length > 0;

          if (!wantsQuiz) {
            if (existingQuiz) {
              const attemptsCount = await tx.trainingAttempt.count({ where: { quizId: existingQuiz.id } });
              if (attemptsCount > 0) {
                throw new Error("Não é possível remover a avaliação: já existem tentativas de colaboradores registradas.");
              }
              await tx.trainingQuiz.delete({ where: { id: existingQuiz.id } });
            }
            continue;
          }

          const quizInput = m.quiz as QuizInput;
          const quizFields = {
            minScore: Number(quizInput.minScore) || 90,
            maxAttempts: Number(quizInput.maxAttempts) || 3,
            timeLimitMinutes: quizInput.timeLimitMinutes ? Number(quizInput.timeLimitMinutes) : null,
          };
          const quizId = existingQuiz
            ? existingQuiz.id
            : (await tx.trainingQuiz.create({ data: { ...quizFields, moduleId } })).id;
          if (existingQuiz) {
            await tx.trainingQuiz.update({ where: { id: quizId }, data: quizFields });
          }

          // Perguntas/alternativas: substituição total a cada edição — não
          // têm progresso próprio associado (a resposta de cada tentativa
          // fica gravada como JSON solto em TrainingAttempt.answers, sem FK
          // pra TrainingQuestion), então apagar/recriar não quebra nada já
          // registrado, mesmo padrão que já era usado antes desta fase.
          await tx.trainingQuestion.deleteMany({ where: { quizId } });
          for (let qi = 0; qi < quizInput.questions.length; qi++) {
            const q = quizInput.questions[qi];
            const createdQuestion = await tx.trainingQuestion.create({
              data: { quizId, text: q.text, type: (q.type as never) || "MULTIPLA_ESCOLHA", order: qi },
            });
            for (let oi = 0; oi < (q.options ?? []).length; oi++) {
              const o = q.options[oi];
              await tx.trainingQuestionOption.create({
                data: { questionId: createdQuestion.id, text: o.text, correct: !!o.correct, order: oi },
              });
            }
          }
        }
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível salvar as alterações.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "UPDATE", entityType: "TrainingCourse", entityId: id, after: (data.name as string) ?? existing.name },
  });

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

  return NextResponse.json({ course });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para excluir cursos." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "universidade", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir cursos." },
      { status: 403 }
    );
  }
  const { id } = await params;
  try {
    await prisma.trainingCourse.delete({ where: { id } });
  } catch {
    return NextResponse.json(
      {
        error:
          "Não é possível excluir: existem colaboradores matriculados ou certificados já emitidos em algum módulo deste curso.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
