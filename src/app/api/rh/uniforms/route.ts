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

  const deliveries = await prisma.uniformDelivery.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(employeeId ? { employeeId } : {}),
    },
    orderBy: { dataEntrega: "desc" },
    include: { employee: { select: { name: true, setor: true } } },
  });
  return NextResponse.json({ deliveries });
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

  const delivery = await prisma.uniformDelivery.create({
    data: {
      employeeId: body.employeeId,
      empresaId: empresa.id,
      item: body.item,
      quantidade: Number(body.quantidade) || 1,
      tamanho: body.tamanho || null,
      dataEntrega: new Date(body.dataEntrega),
      responsavel: body.responsavel || null,
      status: body.status || "ENTREGUE",
      observacao: body.observacao || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ delivery });
}
