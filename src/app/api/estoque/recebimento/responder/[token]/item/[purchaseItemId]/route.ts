import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadPurchaseByToken, logPurchaseEvent, receivingState } from "@/lib/recebimento-server";
import { RECEIVING_ITEM_DIVERGENCE_REQUIRES_PHOTO } from "@/lib/estoque";

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string; purchaseItemId: string }> }) {
  const { token, purchaseItemId } = await params;
  const purchase = await loadPurchaseByToken(token);
  const state = receivingState(purchase);
  if (state === "invalido") return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (state !== "ok" || !purchase!.receiving) {
    return NextResponse.json({ error: "Inicie o recebimento antes de conferir os produtos." }, { status: 400 });
  }

  const item = purchase!.items.find((it) => it.id === purchaseItemId);
  if (!item || !item.receivingItem) {
    return NextResponse.json({ error: "Item não encontrado neste pedido." }, { status: 404 });
  }

  const body = await req.json();
  const condicao: "CONFORME" | "DIVERGENCIA" = body.condicao === "DIVERGENCIA" ? "DIVERGENCIA" : "CONFORME";
  const divergenciaTipos: string[] = Array.isArray(body.divergenciaTipos) ? body.divergenciaTipos : [];
  const quantidadeRecebida = body.quantidadeRecebida != null ? Number(body.quantidadeRecebida) : null;

  if (condicao === "DIVERGENCIA") {
    if (divergenciaTipos.length === 0) {
      return NextResponse.json({ error: "Selecione ao menos um tipo de divergência." }, { status: 400 });
    }
    const precisaFoto = divergenciaTipos.some((t) => RECEIVING_ITEM_DIVERGENCE_REQUIRES_PHOTO.has(t));
    if (precisaFoto && !body.fotoUrl) {
      return NextResponse.json({ error: "Adicione uma foto para comprovar essa divergência." }, { status: 400 });
    }
  }

  const naoRecebido = divergenciaTipos.includes("PRODUTO_NAO_ENTREGUE");
  const status = naoRecebido ? "NAO_RECEBIDO" : condicao === "DIVERGENCIA" ? "DIVERGENCIA" : "CONFERIDO";

  const receivingItem = await prisma.receivingItem.update({
    where: { purchaseItemId },
    data: {
      status,
      quantidadeRecebida,
      pesoAferido: body.pesoAferido != null ? Number(body.pesoAferido) : null,
      temperaturaAferida: body.temperaturaAferida != null ? Number(body.temperaturaAferida) : null,
      validadeInformada: body.validadeInformada ? new Date(body.validadeInformada) : null,
      precoInformado: body.precoInformado != null ? Number(body.precoInformado) : null,
      fotoUrl: body.fotoUrl || null,
      divergenciaTipos: divergenciaTipos.length ? divergenciaTipos.join(",") : null,
      divergenciaDescricao: body.divergenciaDescricao || null,
    },
  });

  if (status === "DIVERGENCIA" || status === "NAO_RECEBIDO") {
    await logPurchaseEvent({
      purchaseId: purchase!.id,
      empresaId: purchase!.empresaId,
      action: `Divergência registrada — ${item.ingredient.name}`,
      userId: purchase!.responsavelRecebimentoId,
    });
  }

  return NextResponse.json({ receivingItem });
}
