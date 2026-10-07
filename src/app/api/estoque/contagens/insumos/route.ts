import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

/**
 * Listagem "magra" de `Ingredient` ativos da loja ativa — só `id`/`name`/`setor`, SEM
 * `precoAtual`/fornecedor (diferente de GET /api/ficha-tecnica/insumos, que expõe preço e por
 * isso é restrito a MANAGER_ROLES). Usada pela tela "Iniciar contagem" (Estoque > Contagem de
 * Estoque) pra deixar quem tem `estoque:canCreate` escolher manualmente quais itens entram numa
 * contagem nova, em vez de sempre todos os ativos do setor (ver campo opcional `ingredientIds`
 * de POST /api/estoque/contagens) — por isso o gate aqui é `canCreate` (mesma permissão de criar
 * a contagem), não um cargo (`MANAGER_ROLES`) como a listagem da Ficha Técnica: aqui não há preço
 * nenhum pra proteger.
 *
 * `?setor=` (opcional) filtra pelo mesmo setor que a contagem vai usar — mesma semântica de
 * `StockCount.setor`/`StockCountSchedule.setor` (ausente/vazio = todos os setores da empresa).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite iniciar contagens de estoque." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para listar os insumos." }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const setor = searchParams.get("setor");

  const ingredients = await prisma.ingredient.findMany({
    where: { empresaId: empresa.id, active: true, ...(setor ? { setor } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, setor: true },
  });
  return NextResponse.json({ ingredients });
}
