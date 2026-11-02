import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Estoque." },
      { status: 403 }
    );
  }

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
  if (!(await hasModulePermission(session.user.id, "estoque", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite solicitar transferências entre lojas." },
      { status: 403 }
    );
  }

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

  // Cada item transferido precisa ser um insumo da loja de ORIGEM (quem está enviando, e
  // cujo estoque será debitado ao confirmar o envio — ver PATCH [id]/route.ts) — mesmo padrão já
  // usado em /api/estoque/movimentos e /api/estoque/perdas (ingredient.empresaId !== empresa.id →
  // 400). Achado do Otavio (revisão geral, 2026-11-02): sem essa checagem, dava pra solicitar a
  // transferência de um insumo de OUTRA loja, que nem está no estoque desta origem.
  const ingredientIds = [...new Set((body.itens as { ingredientId: string }[]).map((it) => it.ingredientId))];
  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: ingredientIds } },
    select: { id: true, empresaId: true },
  });
  if (ingredients.length !== ingredientIds.length || ingredients.some((i) => i.empresaId !== origem.id)) {
    return NextResponse.json({ error: "Um ou mais insumos informados não pertencem à loja de origem." }, { status: 400 });
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
