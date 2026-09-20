import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { spStartOfDay } from "@/lib/checklist";
import { parseDateKeyInput } from "@/lib/escala-folgas";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.absence.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar afastamentos." },
      { status: 403 }
    );
  }
  const body = await req.json();

  // "YYYY-MM-DD" pronto, gravado com `spStartOfDay` — nunca `new Date(raw)` cru (mesma correção
  // de fuso já aplicada no POST desta rota; ver `parseDateKeyInput`/`spStartOfDay`).
  let dataInicio: Date | undefined;
  if (body.dataInicio) {
    const parsed = parseDateKeyInput(body.dataInicio);
    if (!parsed) return NextResponse.json({ error: "Data de início inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
    dataInicio = spStartOfDay(parsed);
  }
  let dataFim: Date | null | undefined;
  if (body.dataFim !== undefined) {
    if (body.dataFim) {
      const parsed = parseDateKeyInput(body.dataFim);
      if (!parsed) return NextResponse.json({ error: "Data de fim inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
      dataFim = spStartOfDay(parsed);
    } else {
      dataFim = null;
    }
  }

  const absence = await prisma.absence.update({
    where: { id },
    data: {
      dataInicio,
      dataFim,
      motivo: body.motivo !== undefined ? body.motivo || null : undefined,
      status: body.status ?? undefined,
      observacao: body.observacao !== undefined ? body.observacao || null : undefined,
    },
  });
  return NextResponse.json({ absence });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.absence.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir afastamentos." },
      { status: 403 }
    );
  }
  await prisma.absence.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
