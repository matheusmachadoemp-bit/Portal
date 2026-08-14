import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const transfers = await prisma.transfer.findMany({
    where: { OR: [{ origemEmpresaId: { in: empresaIds } }, { destinoEmpresaId: { in: empresaIds } }] },
    orderBy: { createdAt: "desc" },
    include: {
      origemEmpresa: { select: { id: true, name: true, color: true } },
      destinoEmpresa: { select: { id: true, name: true, color: true } },
      items: { include: { ingredient: { select: { id: true, name: true, unidade: true, precoAtual: true, quantidadeEmbalagem: true } } } },
    },
  });
  return NextResponse.json({ transfers });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const origem = await requireActiveSingleEmpresa();
  if (!origem) {
    return NextResponse.json({ error: "Selecione a loja de origem específica para solicitar a transferência." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.destinoEmpresaId || !Array.isArray(body.itens) || body.itens.length === 0) {
    return NextResponse.json({ error: "Informe a loja de destino e ao menos um item." }, { status: 400 });
  }
  if (body.destinoEmpresaId === origem.id) {
    return NextResponse.json({ error: "A loja de destino deve ser diferente da loja de origem." }, { status: 400 });
  }

  const transfer = await prisma.transfer.create({
    data: {
      origemEmpresaId: origem.id,
      destinoEmpresaId: body.destinoEmpresaId,
      responsavelEnvio: body.responsavelEnvio || session.user.name || null,
      observacao: body.observacao || null,
      status: "SOLICITADA",
      createdById: session.user.id,
      items: {
        create: body.itens.map((it: { ingredientId: string; quantidade: number; unidade: string }) => ({
          ingredientId: it.ingredientId,
          unidade: it.unidade,
          quantidadeEnviada: Number(it.quantidade) || 0,
        })),
      },
    },
    include: { items: { include: { ingredient: true } }, origemEmpresa: true, destinoEmpresa: true },
  });

  return NextResponse.json({ transfer });
}
