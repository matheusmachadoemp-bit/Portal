import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const losses = await prisma.loss.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { data: "desc" },
    take: 300,
    include: { ingredient: { select: { id: true, name: true, unidade: true, setor: true } }, createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ losses });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para registrar uma perda." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.ingredientId || !body.motivo || body.quantidade === undefined) {
    return NextResponse.json({ error: "Informe o produto, a quantidade e o motivo." }, { status: 400 });
  }

  const ingredient = await prisma.ingredient.findUnique({ where: { id: body.ingredientId } });
  if (!ingredient || ingredient.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Produto inválido para esta loja." }, { status: 400 });
  }

  const quantidade = Number(body.quantidade) || 0;
  const estoqueApos = Math.max(0, ingredient.estoqueAtual - quantidade);
  const valorEstimado = body.valorEstimado !== undefined ? Number(body.valorEstimado) : (ingredient.precoAtual / (ingredient.quantidadeEmbalagem || 1)) * quantidade;

  const [loss] = await prisma.$transaction([
    prisma.loss.create({
      data: {
        empresaId: empresa.id,
        setor: body.setor || ingredient.setor || null,
        ingredientId: ingredient.id,
        quantidade,
        unidade: ingredient.unidade,
        valorEstimado,
        motivo: body.motivo,
        responsavel: body.responsavel || session.user.name || null,
        aprovador: body.aprovador || null,
        fotoUrl: body.fotoUrl || null,
        observacao: body.observacao || null,
        createdById: session.user.id,
      },
    }),
    prisma.stockMovement.create({
      data: {
        ingredientId: ingredient.id,
        empresaId: empresa.id,
        type: "PERDA",
        quantidade,
        estoqueApos,
        motivo: `Perda — ${body.motivo}`,
        origin: "PERDA",
        createdById: session.user.id,
      },
    }),
    prisma.ingredient.update({ where: { id: ingredient.id }, data: { estoqueAtual: estoqueApos } }),
  ]);

  return NextResponse.json({ loss });
}
