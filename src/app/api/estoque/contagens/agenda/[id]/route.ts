import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess, findUsersWithoutEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const WEEKDAY_FIELDS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"] as const;

function isValidHorario(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.stockCountSchedule.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite configurar a agenda de contagens de estoque." },
      { status: 403 }
    );
  }

  const body = await req.json();

  if (body.horario !== undefined && !isValidHorario(body.horario)) {
    return NextResponse.json({ error: "Informe um horário válido (HH:mm)." }, { status: 400 });
  }
  if (body.responsavelId) {
    const responsavel = await prisma.user.findUnique({ where: { id: body.responsavelId }, select: { id: true } });
    if (!responsavel) return NextResponse.json({ error: "Responsável inválido." }, { status: 400 });
    // Mesma checagem do POST desta agenda (ver comentário lá): o responsável precisa ter
    // acesso à loja deste agendamento, senão alguém de outra loja passaria a receber o
    // lembrete diário de uma tarefa à qual não tem acesso.
    const invalidIds = await findUsersWithoutEmpresaAccess([body.responsavelId], existing.empresaId);
    if (invalidIds.length > 0) {
      return NextResponse.json({ error: "Esse responsável não tem acesso a esta loja." }, { status: 400 });
    }
  }

  const weekdayData: Record<string, boolean> = {};
  for (const field of WEEKDAY_FIELDS) {
    if (body[field] !== undefined) weekdayData[field] = !!body[field];
  }

  const schedule = await prisma.stockCountSchedule.update({
    where: { id },
    data: {
      type: body.type === "MENSAL" || body.type === "SEMANAL" ? body.type : undefined,
      setor: body.setor !== undefined ? body.setor || null : undefined,
      responsavelId: body.responsavelId !== undefined ? body.responsavelId || null : undefined,
      horario: body.horario ?? undefined,
      active: body.active !== undefined ? !!body.active : undefined,
      ...weekdayData,
    },
  });
  return NextResponse.json({ schedule });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.stockCountSchedule.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite configurar a agenda de contagens de estoque." },
      { status: 403 }
    );
  }

  await prisma.stockCountSchedule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
