import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/permissions";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const courses = await prisma.trainingCourse.findMany({
    where: { OR: [{ empresaId: null }, { empresaId: { in: empresaIds } }] },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      modules: { orderBy: { order: "asc" } },
      quiz: { include: { questions: { include: { options: true }, orderBy: { order: "asc" } } } },
      empresa: { select: { name: true } },
      _count: { select: { enrollments: true } },
    },
  });

  const isManager = canManageUsers(session.user.role);
  const sanitized = isManager
    ? courses
    : courses.map((c) =>
        c.quiz
          ? {
              ...c,
              quiz: {
                ...c.quiz,
                questions: c.quiz.questions.map((q) => ({
                  ...q,
                  options: q.options.map((o) => ({ ...o, correct: false })),
                })),
              },
            }
          : c
      );

  return NextResponse.json({ courses: sanitized });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para criar cursos." }, { status: 403 });
  }

  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }

  const slug = `${String(body.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;

  const course = await prisma.trainingCourse.create({
    data: {
      name: body.name,
      slug,
      category: body.category || null,
      description: body.description || null,
      cargo: body.cargo || null,
      empresaId: body.empresaId || null,
      imageUrl: body.imageUrl || null,
      instructor: body.instructor || null,
      cargaHoraria: Number(body.cargaHoraria) || 0,
      status: body.status || "RASCUNHO",
      mandatory: !!body.mandatory,
      createdById: session.user.id,
    },
  });

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "CREATE", entityType: "TrainingCourse", entityId: course.id, after: course.name },
  });

  return NextResponse.json({ course });
}
