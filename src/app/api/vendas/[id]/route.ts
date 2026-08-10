import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const before = await prisma.salesEntry.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, before.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const entry = await prisma.salesEntry.update({
    where: { id },
    data: {
      date: body.date ? new Date(body.date) : undefined,
      periodType: body.periodType ?? undefined,
      faturamentoDelivery: body.faturamentoDelivery !== undefined ? Number(body.faturamentoDelivery) : undefined,
      faturamentoSalao: body.faturamentoSalao !== undefined ? Number(body.faturamentoSalao) : undefined,
      pedidosDelivery: body.pedidosDelivery !== undefined ? Number(body.pedidosDelivery) : undefined,
      pedidosBalcao: body.pedidosBalcao !== undefined ? Number(body.pedidosBalcao) : undefined,
      pedidosSalao: body.pedidosSalao !== undefined ? Number(body.pedidosSalao) : undefined,
      mesasAtendidas: body.mesasAtendidas !== undefined ? Number(body.mesasAtendidas) : undefined,
      taxaServicoValor: body.taxaServicoValor !== undefined ? Number(body.taxaServicoValor) : undefined,
      metaDiaria: body.metaDiaria !== undefined ? Number(body.metaDiaria) : undefined,
      observacoes: body.observacoes ?? undefined,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: before.empresaId,
      action: "UPDATE",
      entityType: "SalesEntry",
      entityId: id,
      before: JSON.stringify(before),
      after: JSON.stringify(entry),
    },
  });

  return NextResponse.json({ entry });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const before = await prisma.salesEntry.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, before.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  await prisma.salesEntry.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: before.empresaId,
      action: "DELETE",
      entityType: "SalesEntry",
      entityId: id,
      before: JSON.stringify(before),
    },
  });

  return NextResponse.json({ ok: true });
}
