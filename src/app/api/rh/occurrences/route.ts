import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const occurrences = await prisma.occurrence.findMany({
    where: { employee: { empresaId: { in: empresaIdsForContext(ctx) } } },
    orderBy: { date: "desc" },
    include: { employee: { select: { name: true, setor: true } } },
  });
  return NextResponse.json({ occurrences });
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

  const occurrence = await prisma.occurrence.create({
    data: {
      employeeId: body.employeeId,
      date: new Date(body.date),
      type: body.type,
      horarioPrevisto: body.horarioPrevisto || null,
      horarioRealizado: body.horarioRealizado || null,
      minutosAtraso: Number(body.minutosAtraso) || 0,
      justificativa: body.justificativa || null,
      anexoUrl: body.anexoUrl || null,
      observacao: body.observacao || null,
      status: body.status || "PENDENTE",
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ occurrence });
}
