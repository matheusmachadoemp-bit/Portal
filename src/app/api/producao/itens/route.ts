import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { PRODUCTION_MANAGER_ROLES } from "@/lib/producao-server";

type IngredienteInput = { ingredientId: string; quantidadeUsada: number; unidade: string };

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const categoria = searchParams.get("categoria");
  const q = searchParams.get("q");

  const where: Record<string, unknown> = { empresaId: { in: empresaIds } };
  if (categoria) where.categoryId = categoria;
  if (q) where.name = { contains: q, mode: "insensitive" };

  const itens = await prisma.productionItem.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      category: { select: { id: true, name: true, color: true, icon: true } },
      ingredientes: { include: { ingredient: { select: { id: true, name: true, unidade: true } } }, orderBy: { order: "asc" } },
      stock: true,
    },
  });

  return NextResponse.json({ itens });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode cadastrar produtos de produção." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!body.name || !body.categoryId) {
    return NextResponse.json({ error: "Nome e categoria são obrigatórios." }, { status: 400 });
  }

  const ingredientes: IngredienteInput[] = Array.isArray(body.ingredientes) ? body.ingredientes : [];

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.productionItem.create({
      data: {
        empresaId: empresa.id,
        categoryId: body.categoryId,
        name: body.name,
        unidade: body.unidade || "kg",
        fotoUrl: body.fotoUrl || null,
        descricao: body.descricao || null,
        tipo: body.tipo || "VARIAVEL",
        quantidadeMinima: Number(body.quantidadeMinima) || 0,
        margemSeguranca: Number(body.margemSeguranca) || 0,
        tamanhoLote: body.tamanhoLote ? Number(body.tamanhoLote) : null,
        validadeDias: body.validadeDias ? Number(body.validadeDias) : null,
        horarioLimitePadrao: body.horarioLimitePadrao || null,
        prioridadePadrao: body.prioridadePadrao || "NORMAL",
        ingredientId: body.ingredientId || null,
        createdById: session.user.id,
      },
    });

    if (ingredientes.length > 0) {
      await tx.productionItemIngredient.createMany({
        data: ingredientes.map((ing, order) => ({
          productionItemId: created.id,
          ingredientId: ing.ingredientId,
          quantidadeUsada: Number(ing.quantidadeUsada) || 0,
          unidade: ing.unidade || "g",
          order,
        })),
      });
    }

    await tx.productionStock.create({ data: { productionItemId: created.id, empresaId: empresa.id, saldoAtual: 0 } });

    return tx.productionItem.findUniqueOrThrow({ where: { id: created.id }, include: { ingredientes: true, stock: true } });
  });

  return NextResponse.json({ item });
}
