import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const purchases = await prisma.purchase.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { data: "desc" },
    take: 300,
    include: {
      supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      items: { include: { ingredient: { select: { id: true, name: true, unidade: true, precoAtual: true, quantidadeEmbalagem: true } } } },
      receiving: { select: { id: true, status: true } },
      createdBy: { select: { name: true } },
    },
  });
  return NextResponse.json({ purchases });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para registrar uma compra." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.supplierId || !Array.isArray(body.itens) || body.itens.length === 0) {
    return NextResponse.json({ error: "Informe o fornecedor e ao menos um item." }, { status: 400 });
  }

  const purchase = await prisma.purchase.create({
    data: {
      empresaId: empresa.id,
      supplierId: body.supplierId,
      numeroNota: body.numeroNota || null,
      data: body.data ? new Date(body.data) : new Date(),
      compradorResponsavel: body.compradorResponsavel || session.user.name || null,
      formaPagamento: body.formaPagamento || null,
      dataVencimento: body.dataVencimento ? new Date(body.dataVencimento) : null,
      desconto: Number(body.desconto) || 0,
      frete: Number(body.frete) || 0,
      status: body.status || "PEDIDO_REALIZADO",
      observacoes: body.observacoes || null,
      createdById: session.user.id,
      items: {
        create: body.itens.map((it: { ingredientId: string; quantidade: number; unidade: string; valorUnitario: number }) => ({
          ingredientId: it.ingredientId,
          quantidade: Number(it.quantidade) || 0,
          unidade: it.unidade,
          valorUnitario: Number(it.valorUnitario) || 0,
          valorTotal: (Number(it.quantidade) || 0) * (Number(it.valorUnitario) || 0),
        })),
      },
    },
    include: { items: true, supplier: true },
  });

  return NextResponse.json({ purchase });
}
