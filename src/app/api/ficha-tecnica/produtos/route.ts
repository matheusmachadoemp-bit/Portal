import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { isValidBlobUrl } from "@/lib/manutencao-server";
import { createWithAutoCode } from "@/lib/ficha-code";

// Checagem de cargo (MANAGER_ROLES) — sem ela, qualquer COLABORADOR com o Perfil de Permissão
// padrão "Funcionário" (ficha-tecnica:canView=true de fábrica) conseguia ver o custo/fornecedor
// de cada insumo via o `include` do Ingredient inteiro abaixo (achado ALTO do Jonas, auditoria de
// 2026-10-01). Bloqueio da tela inteira (não só do campo de preço): o preço não é só um campo a
// mais — ele alimenta "Custo"/"CMV %"/"Margem"/"Lucro", exibidos em TODO card de produto desta
// tela (src/app/portal/ficha-tecnica/[sub]/produtos-client.tsx, calculados no client a partir de
// `ingredient.precoAtual`), então ocultar só `precoAtual`/`fornecedor` da resposta quebraria
// visualmente esses 4 campos em cada card (ficariam NaN) sem de fato esconder o custo, já que o
// card principal da listagem é justamente isso. A composição de ingredientes do produto (o que
// um colaborador operacional poderia querer ver sem preço) já só é visível pra quem tem
// `canCreate` (botão "Editar", já escondido pra quem não tem) — colaborador comum não via isso
// mesmo antes desta mudança. Essa rota só serve as abas de categoria de produto (nunca "Insumos",
// que usa /api/ficha-tecnica/insumos — rota à parte, fora do escopo deste achado).
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "ficha-tecnica", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver a Ficha Técnica." },
      { status: 403 }
    );
  }
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json(
      { error: "Essa listagem é restrita a Administrador, Gestor, Gerente ou Supervisor." },
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
  // O código de identificação é sempre gerado pelo sistema (ver `createWithAutoCode`): um `code`
  // vindo no corpo da requisição é ignorado, pra nunca haver código digitado à mão nem repetido.
  if (body.photoUrl && !isValidBlobUrl(body.photoUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
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

  const category = typeof body.category === "string" ? body.category : "";
  const product = await createWithAutoCode(category, (code) =>
    prisma.product.create({
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
    })
  );

  return NextResponse.json({ product });
}
