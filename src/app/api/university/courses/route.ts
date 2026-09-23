import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/permissions";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { courseEmpresaWhere, courseStatusWhere } from "@/lib/university-server";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "universidade", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Universidade." }, { status: 403 });
  }

  const isManager = canManageUsers(session.user.role);
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  // Filtro de loja (`courseEmpresaWhere`) + status (`courseStatusWhere`) — 2ª rodada da tarefa
  // #317 (achado CRÍTICO do Teulis, na revisão da própria #317): esta é a rota de LISTAGEM/coleção
  // (diferente de `courses/[id]/route.ts`, já corrigida na 1ª rodada). Só tinha o filtro de loja
  // (desde a #315); sem o de status, devolvia cursos em RASCUNHO inteiros (nome, videoUrl,
  // content) pro JSON de qualquer usuário com `canView` em Universidade — o único chamador atual
  // no client fica atrás de um botão só-admin, mas isso nunca protegeu nada no servidor: a rota é
  // alcançável direto por curl/DevTools por qualquer usuário comum.
  const courses = await prisma.trainingCourse.findMany({
    where: { ...courseEmpresaWhere(empresaIds), ...courseStatusWhere(isManager) },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: { orderBy: { order: "asc" } },
          quiz: { include: { questions: { include: { options: true }, orderBy: { order: "asc" } } } },
        },
      },
      empresa: { select: { name: true } },
      _count: { select: { enrollments: true } },
    },
  });

  const sanitized = isManager
    ? courses
    : courses.map((c) => ({
        ...c,
        modules: c.modules.map((m) =>
          m.quiz
            ? {
                ...m,
                quiz: {
                  ...m.quiz,
                  questions: m.quiz.questions.map((q) => ({
                    ...q,
                    options: q.options.map((o) => ({ ...o, correct: false })),
                  })),
                },
              }
            : m
        ),
      }));

  return NextResponse.json({ courses: sanitized });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para criar cursos." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "universidade", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar cursos." },
      { status: 403 }
    );
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
