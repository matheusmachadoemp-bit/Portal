import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");

  const vacations = await prisma.vacation.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(employeeId ? { employeeId } : {}),
    },
    orderBy: { periodoAquisitivoInicio: "desc" },
    include: { employee: { select: { name: true, setor: true } } },
  });
  return NextResponse.json({ vacations });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
  if (!employee || employee.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Colaborador inválido para a loja ativa." }, { status: 400 });
  }

  const vacation = await prisma.vacation.create({
    data: {
      employeeId: body.employeeId,
      empresaId: empresa.id,
      periodoAquisitivoInicio: new Date(body.periodoAquisitivoInicio),
      periodoAquisitivoFim: new Date(body.periodoAquisitivoFim),
      diasDireito: Number(body.diasDireito) || 30,
      dataInicio: body.dataInicio ? new Date(body.dataInicio) : null,
      dataFim: body.dataFim ? new Date(body.dataFim) : null,
      dias: body.dias ? Number(body.dias) : null,
      status: body.status || "PLANEJADA",
      observacao: body.observacao || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ vacation });
}
