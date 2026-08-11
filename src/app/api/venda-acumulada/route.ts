import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const entries = await prisma.waiterSaleEntry.findMany({
    where: { empresaId: { in: empresaIds } },
    include: { employee: { select: { id: true, name: true, cargo: true, photoUrl: true, empresaId: true } } },
    orderBy: { date: "desc" },
  });

  const employees = await prisma.employee.findMany({
    where: { empresaId: { in: empresaIds }, status: "ATIVO" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, cargo: true, photoUrl: true },
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      employeeId: e.employeeId,
      employeeName: e.employee.name,
      employeePhoto: e.employee.photoUrl,
      amount: e.amount,
      date: e.date.toISOString(),
      note: e.note,
    })),
    employees,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível lançar vendas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!body.employeeId || !body.amount) {
    return NextResponse.json({ error: "Informe o garçom e o valor vendido." }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
  if (!employee || employee.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Colaborador inválido para esta loja." }, { status: 400 });
  }

  const entry = await prisma.waiterSaleEntry.create({
    data: {
      employeeId: body.employeeId,
      empresaId: empresa.id,
      amount: Number(body.amount) || 0,
      date: body.date ? new Date(body.date) : new Date(),
      note: body.note || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ entry });
}
