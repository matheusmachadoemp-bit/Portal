import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadPurchaseByToken, receivingState } from "@/lib/recebimento-server";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const purchase = await loadPurchaseByToken(token);
  const state = receivingState(purchase);

  if (state === "invalido") return NextResponse.json({ state }, { status: 404 });
  if (state !== "ok") return NextResponse.json({ state });

  return NextResponse.json({ state: "ok", purchase });
}

/** "Iniciar recebimento": cria o Receiving (se ainda não existir) e os ReceivingItem de cada item do pedido. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const purchase = await loadPurchaseByToken(token);
  const state = receivingState(purchase);
  if (state === "invalido") return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (state !== "ok") return NextResponse.json({ error: "Esse pedido não aceita mais conferência." }, { status: 400 });

  if (purchase!.receiving) {
    return NextResponse.json({ ok: true, alreadyStarted: true });
  }

  await prisma.$transaction([
    prisma.receiving.create({
      data: {
        purchaseId: purchase!.id,
        empresaId: purchase!.empresaId,
        responsavel: purchase!.responsavelRecebimento?.name ?? null,
        dataInicio: new Date(),
        items: {
          create: purchase!.items.map((it) => ({ purchaseItemId: it.id })),
        },
      },
    }),
    prisma.purchase.update({ where: { id: purchase!.id }, data: { status: "EM_CONFERENCIA" } }),
  ]);

  return NextResponse.json({ ok: true });
}
