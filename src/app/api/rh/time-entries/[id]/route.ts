import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { computeHorasTrabalhadas } from "@/lib/rh-helpers";
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
  const existing = await prisma.timeEntry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar registros de ponto." },
      { status: 403 }
    );
  }
  const body = await req.json();

  // Task #318 (mesmo achado do Teulis aplicado a POST /api/rh/time-entries): quando `body.date` vem
  // preenchido, precisa ser um "YYYY-MM-DD" válido, gravado com `spStartOfDay` (meia-noite de São
  // Paulo) — nunca `new Date(body.date)` cru (meia-noite UTC, 3h antes, que fazia o registro cair
  // fora do `gte` de período calculado por `resolveRollingPeriod`/`spMonthStart`). `undefined`
  // continua significando "não alterar a data" (mesmo comportamento de antes).
  let dateUpdate: Date | undefined;
  if (body.date) {
    const dateKey = parseDateKeyInput(body.date);
    if (!dateKey) {
      return NextResponse.json({ error: "Data inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
    }
    dateUpdate = spStartOfDay(dateKey);
  }

  const entrada = body.entrada !== undefined ? body.entrada : existing.entrada;
  const saidaAlmoco = body.saidaAlmoco !== undefined ? body.saidaAlmoco : existing.saidaAlmoco;
  const retornoAlmoco = body.retornoAlmoco !== undefined ? body.retornoAlmoco : existing.retornoAlmoco;
  const saida = body.saida !== undefined ? body.saida : existing.saida;

  const entry = await prisma.timeEntry.update({
    where: { id },
    data: {
      date: dateUpdate,
      entrada: body.entrada !== undefined ? body.entrada || null : undefined,
      saidaAlmoco: body.saidaAlmoco !== undefined ? body.saidaAlmoco || null : undefined,
      retornoAlmoco: body.retornoAlmoco !== undefined ? body.retornoAlmoco || null : undefined,
      saida: body.saida !== undefined ? body.saida || null : undefined,
      horasTrabalhadas: computeHorasTrabalhadas({ entrada, saidaAlmoco, retornoAlmoco, saida }),
      atrasoMinutos: body.atrasoMinutos !== undefined ? Number(body.atrasoMinutos) : undefined,
      falta: body.falta !== undefined ? !!body.falta : undefined,
    },
  });

  return NextResponse.json({ entry });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.timeEntry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir registros de ponto." },
      { status: 403 }
    );
  }
  await prisma.timeEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
