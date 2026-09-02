import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const partners = await prisma.marketingPartner.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { vendas: "desc" },
    include: { createdBy: { select: { name: true } }, empresa: { select: { name: true, color: true } } },
  });

  return NextResponse.json({ partners });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!body.nome || !String(body.nome).trim()) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }
  if (!body.cupom || !String(body.cupom).trim()) {
    return NextResponse.json({ error: "Cupom é obrigatório." }, { status: 400 });
  }

  const partner = await prisma.marketingPartner.create({
    data: {
      empresaId: empresa.id,
      nome: body.nome,
      cupom: body.cupom,
      quantidadeUtilizada: Number(body.quantidadeUtilizada) || 0,
      vendas: Number(body.vendas) || 0,
      gasto: Number(body.gasto) || 0,
      observacoes: body.observacoes || null,
      createdById: session.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: empresa.id,
      action: "CREATE",
      entityType: "MarketingPartner",
      entityId: partner.id,
      after: partner.nome,
    },
  });

  return NextResponse.json({ partner });
}
