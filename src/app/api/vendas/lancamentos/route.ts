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
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const sales = await prisma.sale.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(from || to
        ? { dateTime: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    },
    orderBy: { dateTime: "desc" },
    take: 200,
    include: { items: true, garcom: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ sales });
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
  const items = (body.items ?? []) as {
    productId?: string;
    nome: string;
    categoria?: string;
    quantidade: string | number;
    precoUnitario: string | number;
  }[];
  if (!items.length) return NextResponse.json({ error: "Adicione ao menos um item à venda." }, { status: 400 });

  const parsedItems = items.map((i) => {
    const quantidade = Number(i.quantidade) || 0;
    const precoUnitario = Number(i.precoUnitario) || 0;
    return {
      productId: i.productId || null,
      nome: i.nome,
      categoria: (i.categoria || null) as never,
      quantidade,
      precoUnitario,
      faturamento: quantidade * precoUnitario,
    };
  });
  const valorTotal = parsedItems.reduce((sum, i) => sum + i.faturamento, 0);

  let clienteId: string | null = null;
  const clienteTelefone = (body.clienteTelefone || "").trim();
  if (clienteTelefone) {
    const cliente = await prisma.cliente.upsert({
      where: { empresaId_telefone: { empresaId: empresa.id, telefone: clienteTelefone } },
      update: { nome: body.clienteNome || undefined },
      create: { empresaId: empresa.id, nome: body.clienteNome || clienteTelefone, telefone: clienteTelefone },
    });
    clienteId = cliente.id;
  }

  const sale = await prisma.sale.create({
    data: {
      empresaId: empresa.id,
      dateTime: body.dateTime ? new Date(body.dateTime) : new Date(),
      channel: body.channel || "SALAO",
      formaPagamento: body.formaPagamento || "OUTRO",
      garcomId: body.garcomId || null,
      clienteId,
      mesaNumero: body.mesaNumero || null,
      bairro: body.bairro || null,
      regiao: body.regiao || null,
      valorTotal,
      createdById: session.user.id,
      items: { create: parsedItems },
    },
    include: { items: true },
  });

  return NextResponse.json({ sale });
}
