import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

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

  const categories = await prisma.stockCategory.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { order: "asc" },
    include: { _count: { select: { ingredients: true } } },
  });
  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar categorias de estoque." },
      { status: 403 }
    );
  }

  // Categoria é um cadastro por loja desde a migration 20261001120000_estoque_setores_categorias_por_loja
  // — criar uma exige uma loja única ativa (não o modo "Grupo Nord" consolidado), mesmo padrão de
  // POST /api/estoque/setores e POST /api/estoque/contagens.
  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para criar uma categoria." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Informe o nome da categoria." }, { status: 400 });

  const key = String(body.name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const maxOrder = await prisma.stockCategory.aggregate({
    where: { empresaId: empresa.id },
    _max: { order: true },
  });

  const category = await prisma.stockCategory.create({
    data: {
      empresaId: empresa.id,
      key: `${key}-${Date.now().toString(36)}`,
      name: body.name,
      color: body.color || "#2952E3",
      icon: body.icon || "Boxes",
      setor: body.setor || null,
      metaPerdaPercent: body.metaPerdaPercent !== undefined ? Number(body.metaPerdaPercent) : 2,
      periodicidadeContagem: body.periodicidadeContagem || "SEMANAL",
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  return NextResponse.json({ category });
}
