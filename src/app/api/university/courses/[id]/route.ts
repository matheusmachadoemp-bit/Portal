import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const course = await prisma.trainingCourse.findUnique({
    where: { id },
    include: {
      modules: { orderBy: { order: "asc" } },
      quiz: { include: { questions: { include: { options: true }, orderBy: { order: "asc" } } } },
      empresa: { select: { name: true } },
    },
  });
  if (!course) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  if (!canManageUsers(session.user.role) && course.quiz) {
    course.quiz.questions = course.quiz.questions.map((q) => ({
      ...q,
      options: q.options.map((o) => ({ ...o, correct: false })),
    }));
  }

  return NextResponse.json({ course });
}

type ModuleInput = {
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para editar cursos." }, { status: 403 });
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

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.trainingCourse.update({ where: { id }, data });
    }

    if (Array.isArray(body.modules)) {
      const modules = body.modules as ModuleInput[];
      await tx.trainingModule.deleteMany({ where: { courseId: id } });
      for (let i = 0; i < modules.length; i++) {
        const m = modules[i];
        await tx.trainingModule.create({
          data: {
            courseId: id,
            title: m.title,
            type: (m.type as never) || "VIDEO",
            videoUrl: m.videoUrl || null,
            durationSeconds: Number(m.durationSeconds) || 0,
            pdfUrl: m.pdfUrl || null,
            content: m.content || null,
            order: i,
          },
        });
      }
    }

    if (body.quiz !== undefined) {
      await tx.trainingQuiz.deleteMany({ where: { courseId: id } });
      const quiz = body.quiz as QuizInput | null;
      if (quiz && quiz.questions?.length) {
        const createdQuiz = await tx.trainingQuiz.create({
          data: {
            courseId: id,
            minScore: Number(quiz.minScore) || 70,
            maxAttempts: Number(quiz.maxAttempts) || 3,
            timeLimitMinutes: quiz.timeLimitMinutes ? Number(quiz.timeLimitMinutes) : null,
          },
        });
        for (let i = 0; i < quiz.questions.length; i++) {
          const q = quiz.questions[i];
          const createdQuestion = await tx.trainingQuestion.create({
            data: { quizId: createdQuiz.id, text: q.text, type: (q.type as never) || "MULTIPLA_ESCOLHA", order: i },
          });
          for (let j = 0; j < (q.options ?? []).length; j++) {
            const o = q.options[j];
            await tx.trainingQuestionOption.create({
              data: { questionId: createdQuestion.id, text: o.text, correct: !!o.correct, order: j },
            });
          }
        }
      }
    }
  });

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "UPDATE", entityType: "TrainingCourse", entityId: id, after: (data.name as string) ?? existing.name },
  });

  const course = await prisma.trainingCourse.findUnique({
    where: { id },
    include: {
      modules: { orderBy: { order: "asc" } },
      quiz: { include: { questions: { include: { options: true }, orderBy: { order: "asc" } } } },
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
  const { id } = await params;
  try {
    await prisma.trainingCourse.delete({ where: { id } });
  } catch {
    return NextResponse.json(
      { error: "Não é possível excluir: existem colaboradores matriculados neste curso." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
