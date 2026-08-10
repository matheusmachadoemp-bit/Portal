import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";

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
  "responsavelId",
  "checklist",
  "tags",
  "recurrenceRule",
  "campaignId",
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
  const body = await req.json();

  const data: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  if (body.date !== undefined) data.date = body.date ? new Date(body.date) : null;
  if (body.order !== undefined) data.order = Number(body.order) || 0;
  if (body.estimatedMinutes !== undefined) data.estimatedMinutes = body.estimatedMinutes ? Number(body.estimatedMinutes) : null;
  if (body.actualMinutes !== undefined) data.actualMinutes = body.actualMinutes ? Number(body.actualMinutes) : null;

  const task = await prisma.marketingTask.update({ where: { id }, data });

  if (data.status && data.status !== existing.status) {
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        empresaId: existing.empresaId,
        action: "STATUS_CHANGE",
        entityType: "MarketingTask",
        entityId: task.id,
        before: existing.status,
        after: `${task.title} → ${data.status}`,
      },
    });
  }

  return NextResponse.json({ task });
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
  await prisma.marketingTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
