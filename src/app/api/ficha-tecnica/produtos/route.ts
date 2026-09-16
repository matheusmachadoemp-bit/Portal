import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

/** `Product.code` é `@unique` no schema inteiro (não por loja) — ver comentário em `POST`. */
function isProductCodeConflict(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    ((e.meta?.target as string[] | undefined)?.includes("code") ?? true)
  );
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "ficha-tecnica", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver a Ficha Técnica." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const products = await prisma.product.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(category ? { category: category as never } : {}),
    },
    orderBy: { name: "asc" },
    include: { ingredients: { include: { ingredient: true }, orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ products });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "ficha-tecnica", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite cadastrar produtos." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Informe o nome do produto." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "Informe o código do produto." }, { status: 400 });
  }

  const ingredientIds = [
    ...new Set((body.ingredients || []).map((i: { ingredientId: string }) => i.ingredientId).filter(Boolean)),
  ] as string[];
  if (ingredientIds.length) {
    const validCount = await prisma.ingredient.count({ where: { id: { in: ingredientIds }, empresaId: empresa.id } });
    if (validCount !== ingredientIds.length) {
      return NextResponse.json({ error: "Um ou mais insumos informados não pertencem a esta loja." }, { status: 400 });
    }
  }

  let product;
  try {
    product = await prisma.product.create({
      data: {
        empresaId: empresa.id,
        name,
        code,
        category: body.category,
        photoUrl: body.photoUrl || null,
        taxaIfood: body.taxaIfood !== undefined && body.taxaIfood !== "" ? Number(body.taxaIfood) : null,
        description: body.description || null,
        rendimento: body.rendimento || null,
        tamanho: body.tamanho || null,
        pesoFinal: body.pesoFinal ? Number(body.pesoFinal) : null,
        precoVenda: Number(body.precoVenda) || 0,
        modoPreparo: body.modoPreparo || null,
        tempoPreparo: body.tempoPreparo ? Number(body.tempoPreparo) : null,
        validade: body.validade || null,
        responsavel: body.responsavel || null,
        createdById: session.user.id,
        ingredients: {
          create: (body.ingredients || []).map(
            (i: { ingredientId: string; quantidadeUsada: string; percentualPerda: string }, idx: number) => ({
              ingredientId: i.ingredientId,
              quantidadeUsada: Number(i.quantidadeUsada) || 0,
              percentualPerda: Number(i.percentualPerda) || 0,
              order: idx,
            })
          ),
        },
      },
      include: { ingredients: { include: { ingredient: true }, orderBy: { order: "asc" } } },
    });
  } catch (e) {
    // `Product.code` é @unique no schema inteiro (não por loja) — o primeiro produto salvo com
    // código em branco já bloqueava esse caminho antes da validação acima, mas dois produtos
    // (de categorias/lojas diferentes) ainda podem colidir com o mesmo código digitado à mão.
    if (isProductCodeConflict(e)) {
      return NextResponse.json({ error: "Este código já está em uso." }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ product });
}
