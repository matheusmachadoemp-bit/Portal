import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { logPurchaseEvent } from "@/lib/recebimento-server";
import { RECEBIMENTO_MANAGE_ROLES } from "@/lib/estoque";
import { hasModulePermission } from "@/lib/authz";

const VALID_TIPOS = ["FORNECEDOR_REPOSICAO", "FORNECEDOR_CREDITO", "PRODUTO_DEVOLVIDO", "DIFERENCA_ACEITA", "OUTRA"];

export async function PATCH(req: Request, { params }: { params: Promise<{ receivingItemId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RECEBIMENTO_MANAGE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não tem permissão para resolver divergências de recebimento." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite resolver divergências de recebimento." },
      { status: 403 }
    );
  }

  const { receivingItemId } = await params;
  const body = await req.json();
  if (!VALID_TIPOS.includes(body.resolucaoTipo)) {
    return NextResponse.json({ error: "Selecione um tipo de resolução válido." }, { status: 400 });
  }

  const receivingItem = await prisma.receivingItem.findUnique({
    where: { id: receivingItemId },
    include: {
      purchaseItem: { select: { ingredient: { select: { name: true } } } },
      receiving: { select: { purchase: { select: { id: true, empresaId: true } } } },
    },
  });
  if (!receivingItem) return NextResponse.json({ error: "Divergência não encontrada." }, { status: 404 });

  const updated = await prisma.receivingItem.update({
    where: { id: receivingItemId },
    data: {
      resolucaoTipo: body.resolucaoTipo,
      resolucaoDataPrevista: body.resolucaoDataPrevista ? new Date(body.resolucaoDataPrevista) : null,
      resolucaoValorCredito: body.resolucaoValorCredito != null && body.resolucaoValorCredito !== "" ? Number(body.resolucaoValorCredito) : null,
      resolucaoObservacao: body.resolucaoObservacao || null,
      resolvidoPorId: session.user.id,
      resolvidoEm: new Date(),
    },
  });

  await logPurchaseEvent({
    purchaseId: receivingItem.receiving.purchase.id,
    empresaId: receivingItem.receiving.purchase.empresaId,
    action: `Divergência resolvida — ${receivingItem.purchaseItem.ingredient.name} (${body.resolucaoTipo})`,
    userId: session.user.id,
  });

  return NextResponse.json({ receivingItem: updated });
}
