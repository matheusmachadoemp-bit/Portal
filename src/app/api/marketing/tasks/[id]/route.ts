import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess, findUsersWithoutEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

// "responsavelId" fica fora desta lista de propósito: precisa de uma validação de acesso à
// loja antes de virar `data.responsavelId` (ver abaixo), diferente dos demais campos que são
// só um valor de texto/enum sem checagem extra.
const FIELDS = [
  "title",
  "description",
  "objetivo",
  "category",
  "socialNetwork",
  "format",
  "status",
  "priority",
  "time",
  "checklist",
  "tags",
  "recurrenceRule",
] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingTask.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "marketing", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar tarefas de marketing." },
      { status: 403 }
    );
  }
  const body = await req.json();

  const data: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  if (body.responsavelId !== undefined) {
    // O responsável precisa ter acesso a esta loja — sem essa checagem, qualquer usuário
    // ativo da empresa toda podia ser designado responsável por uma tarefa de marketing de
    // uma loja à qual não tem acesso nenhum.
    if (body.responsavelId) {
      const invalidIds = await findUsersWithoutEmpresaAccess([body.responsavelId], existing.empresaId);
      if (invalidIds.length > 0) {
        return NextResponse.json({ error: "Esse responsável não tem acesso a esta loja." }, { status: 400 });
      }
    }
    data.responsavelId = body.responsavelId || null;
  }
  if (body.date !== undefined) data.date = body.date ? new Date(body.date) : null;
  if (body.order !== undefined) data.order = Number(body.order) || 0;
  if (body.estimatedMinutes !== undefined) data.estimatedMinutes = body.estimatedMinutes ? Number(body.estimatedMinutes) : null;
  if (body.actualMinutes !== undefined) data.actualMinutes = body.actualMinutes ? Number(body.actualMinutes) : null;

  const task = await prisma.marketingTask.update({ where: { id }, data });

  let historyEntry = null;
  if (data.status && data.status !== existing.status) {
    const log = await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        empresaId: existing.empresaId,
        action: "STATUS_CHANGE",
        entityType: "MarketingTask",
        entityId: task.id,
        before: existing.status,
        after: `${task.title} → ${data.status}`,
      },
      include: { user: { select: { name: true } } },
    });
    historyEntry = {
      id: log.id,
      action: log.action,
      before: log.before,
      after: log.after,
      userName: log.user?.name ?? "Sistema",
      createdAt: log.createdAt.toISOString(),
    };
  }

  return NextResponse.json({ task, historyEntry });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingTask.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "marketing", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir tarefas de marketing." },
      { status: 403 }
    );
  }
  await prisma.marketingTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
