import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/permissions";
import { hasModulePermission } from "@/lib/authz";

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
  // matriculando no próprio curso/trilha) é autoatendimento essencial do dia a dia e por isso NUNCA
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
  // A checagem de status abaixo (curso/trilha em rascunho) só se aplica à auto-matrícula de quem
  // NÃO é admin/gestor — admin/gestor pode se auto-matricular em rascunho (útil para revisar antes
  // de publicar) e matricular outro colaborador continua liberado por canManageUsers, sem depender
  // do status do curso.
  const blockDraftForSelf = isSelfEnroll && !isAdminOrGestor;

  if (body.trackId) {
    const track = await prisma.trainingTrack.findUnique({
      where: { id: body.trackId },
      include: { courses: { include: { course: true } } },
    });
    if (!track) return NextResponse.json({ error: "Trilha não encontrada." }, { status: 404 });
    if (blockDraftForSelf && track.courses.some((tc) => tc.course.status !== "PUBLICADO")) {
      return NextResponse.json({ error: "Esta trilha ainda não está disponível." }, { status: 403 });
    }
    const enrollments = await Promise.all(
      track.courses.map((tc) => enrollUserInCourse(targetUserId, tc.courseId))
    );
    return NextResponse.json({ enrollments });
  }

  if (body.courseId) {
    if (blockDraftForSelf) {
      const course = await prisma.trainingCourse.findUnique({
        where: { id: body.courseId },
        select: { status: true },
      });
      if (!course || course.status !== "PUBLICADO") {
        return NextResponse.json({ error: "Este curso ainda não está disponível." }, { status: 403 });
      }
    }
    const enrollment = await enrollUserInCourse(targetUserId, body.courseId);
    return NextResponse.json({ enrollment });
  }

  return NextResponse.json({ error: "Informe courseId ou trackId." }, { status: 400 });
}
