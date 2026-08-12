import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const automacoes = await prisma.automation.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ automacoes });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para criar uma automação." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.name || !body.trigger) {
    return NextResponse.json({ error: "Nome e gatilho são obrigatórios." }, { status: 400 });
  }

  const automacao = await prisma.automation.create({
    data: {
      empresaId: empresa.id,
      name: String(body.name).trim(),
      trigger: body.trigger,
      waitDays: Number(body.waitDays) || 0,
      actionType: body.actionType ?? "MENSAGEM",
      message: body.message ?? null,
      active: body.active ?? true,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ automacao });
}
