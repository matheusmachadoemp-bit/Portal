import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const plans = await prisma.actionPlan.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { createdAt: "desc" },
    include: { empresa: { select: { name: true, color: true } }, createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ plans });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para criar um plano de ação." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.problema || !body.acaoCorretiva) {
    return NextResponse.json({ error: "Descreva o problema e a ação corretiva." }, { status: 400 });
  }

  const plan = await prisma.actionPlan.create({
    data: {
      empresaId: empresa.id,
      problema: body.problema,
      causaProvavel: body.causaProvavel || null,
      acaoCorretiva: body.acaoCorretiva,
      responsavel: body.responsavel || null,
      prazo: body.prazo ? new Date(body.prazo) : null,
      status: body.status || "PENDENTE",
      createdById: session.user.id,
    },
  });
  return NextResponse.json({ plan });
}
