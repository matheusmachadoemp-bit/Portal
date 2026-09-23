import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/permissions";
import { hasModulePermission } from "@/lib/authz";
import { courseAllowedForActiveEmpresa } from "@/lib/university-server";

async function enrollUserInCourse(userId: string, courseId: string) {
  const existing = await prisma.trainingEnrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (existing) return existing;
  return prisma.trainingEnrollment.create({ data: { userId, courseId } });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const targetUserId: string = body.userId || session.user.id;
  const isSelfEnroll = targetUserId === session.user.id;
  const isAdminOrGestor = canManageUsers(session.user.role);

  // Auto-matrícula (targetUserId === o próprio usuário logado, o caso comum: colaborador se
  // matriculando no próprio curso) é autoatendimento essencial do dia a dia e por isso NUNCA
  // passa por nenhuma checagem de perfil aqui — só matricular OUTRO colaborador é ação de gestão,
  // e já exigia canManageUsers antes desta tarefa; a checagem de perfil (canCreate) foi adicionada
  // logo depois, só dentro deste mesmo bloco.
  if (!isSelfEnroll) {
    if (!isAdminOrGestor) {
      return NextResponse.json({ error: "Sem permissão para matricular outros colaboradores." }, { status: 403 });
    }
    if (!(await hasModulePermission(session.user.id, "universidade", "canCreate"))) {
      return NextResponse.json(
        { error: "Seu perfil de permissão não permite matricular outros colaboradores." },
        { status: 403 }
      );
    }
  }
  // Neste ponto, se !isSelfEnroll então isAdminOrGestor é garantidamente true (checado acima).
  // A checagem de status abaixo (curso em rascunho) só se aplica à auto-matrícula de quem
  // NÃO é admin/gestor — admin/gestor pode se auto-matricular em rascunho (útil para revisar antes
  // de publicar) e matricular outro colaborador continua liberado por canManageUsers, sem depender
  // do status do curso.
  //
  // A matrícula em bloco por trilha (body.trackId) existia aqui antes da Fase 1 desta tarefa —
  // "Trilhas de Aprendizagem" foi descontinuada (ver
  // prisma/migrations/20260915130000_universidade_curso_modulo_aula): cursos que pertenciam a
  // uma trilha viraram módulos de 1 curso só, então matricular no curso já é o equivalente.
  const blockDraftForSelf = isSelfEnroll && !isAdminOrGestor;

  if (body.courseId) {
    const course = await prisma.trainingCourse.findUnique({
      where: { id: body.courseId },
      select: { status: true, empresaId: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Curso não encontrado." }, { status: 404 });
    }

    // Curso restrito a uma loja (empresaId != null; null = compartilhado entre todas, mesmo
    // padrão de Ficha Técnica/Combos) só pode ser matriculado por quem tem essa loja no contexto
    // de loja ativo — mesmo filtro que GET /api/university/courses já aplica na listagem. Sem
    // essa checagem, a rota aceitava courseId de qualquer curso de qualquer loja, mesmo fora do
    // escopo de acesso do usuário, tanto em auto-matrícula quanto ao matricular outro colaborador
    // (achado de auditoria de segurança, tarefa #312 — confirmado explorável ao vivo antes desta
    // correção).
    if (!(await courseAllowedForActiveEmpresa(course.empresaId))) {
      return NextResponse.json({ error: "Este curso não está disponível para a sua loja." }, { status: 403 });
    }

    if (blockDraftForSelf && course.status !== "PUBLICADO") {
      return NextResponse.json({ error: "Este curso ainda não está disponível." }, { status: 403 });
    }
    const enrollment = await enrollUserInCourse(targetUserId, body.courseId);
    return NextResponse.json({ enrollment });
  }

  return NextResponse.json({ error: "Informe courseId." }, { status: 400 });
}
