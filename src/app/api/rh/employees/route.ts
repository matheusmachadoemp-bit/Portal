import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const employees = await prisma.employee.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { name: "asc" },
    include: { empresa: { select: { name: true } } },
  });
  return NextResponse.json({ employees });
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
  const employee = await prisma.employee.create({
    data: {
      empresaId: empresa.id,
      name: body.name,
      cargo: body.cargo,
      setor: body.setor,
      admissionDate: new Date(body.admissionDate),
      terminationDate: body.terminationDate ? new Date(body.terminationDate) : null,
      status: body.status || "ATIVO",
      phone: body.phone || null,
      email: body.email || null,
      cpf: body.cpf || null,
      pixKey: body.pixKey || null,
      birthDate: body.birthDate ? new Date(body.birthDate) : null,
      escala: body.escala || null,
      gestorResponsavel: body.gestorResponsavel || null,
      supervisorResponsavel: body.supervisorResponsavel || null,
      salarioFixo: body.salarioFixo ? Number(body.salarioFixo) : null,
      lastEvaluationDate: body.lastEvaluationDate ? new Date(body.lastEvaluationDate) : null,
      lastEvaluationNote: body.lastEvaluationNote || null,
      lastTrainingDate: body.lastTrainingDate ? new Date(body.lastTrainingDate) : null,
      lastTrainingName: body.lastTrainingName || null,
    },
  });

  return NextResponse.json({ employee });
}
