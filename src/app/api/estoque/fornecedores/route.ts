import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const suppliers = await prisma.supplier.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { razaoSocial: "asc" },
    include: {
      _count: { select: { ingredients: true, purchases: true } },
      purchases: { orderBy: { data: "desc" }, take: 1, select: { data: true } },
    },
  });
  return NextResponse.json({ suppliers });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para cadastrar um fornecedor." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.razaoSocial) return NextResponse.json({ error: "Informe a razão social." }, { status: 400 });

  const supplier = await prisma.supplier.create({
    data: {
      empresaId: empresa.id,
      razaoSocial: body.razaoSocial,
      nomeFantasia: body.nomeFantasia || null,
      cnpj: body.cnpj || null,
      telefone: body.telefone || null,
      whatsapp: body.whatsapp || null,
      email: body.email || null,
      endereco: body.endereco || null,
      prazoPagamentoDias: body.prazoPagamentoDias !== undefined && body.prazoPagamentoDias !== "" ? Number(body.prazoPagamentoDias) : null,
      prazoEntregaDias: body.prazoEntregaDias !== undefined && body.prazoEntregaDias !== "" ? Number(body.prazoEntregaDias) : null,
      pedidoMinimo: body.pedidoMinimo !== undefined && body.pedidoMinimo !== "" ? Number(body.pedidoMinimo) : null,
      avaliacao: body.avaliacao !== undefined ? Number(body.avaliacao) : 0,
      observacao: body.observacao || null,
    },
  });
  return NextResponse.json({ supplier });
}
