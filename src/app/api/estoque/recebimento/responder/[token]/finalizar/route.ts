import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadPurchaseByToken, receivingState } from "@/lib/recebimento-server";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const purchase = await loadPurchaseByToken(token);
  const state = receivingState(purchase);
  if (state === "invalido") return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (state !== "ok" || !purchase!.receiving) {
    return NextResponse.json({ error: "Inicie o recebimento antes de finalizar." }, { status: 400 });
  }

  const pendentes = purchase!.items.filter((it) => it.receivingItem?.status === "NAO_CONFERIDO");
  if (pendentes.length > 0) {
    return NextResponse.json(
      { error: `Confira todos os produtos antes de finalizar (faltam ${pendentes.length}).` },
      { status: 400 }
    );
  }

  const houveDivergencia = purchase!.items.some(
    (it) => it.receivingItem?.status === "DIVERGENCIA" || it.receivingItem?.status === "NAO_RECEBIDO"
  );
  const responsavelId = purchase!.responsavelRecebimentoId;
  const responsavelNome = purchase!.responsavelRecebimento?.name ?? null;

  const movimentos = responsavelId
    ? purchase!.items.flatMap((it) => {
        const ri = it.receivingItem!;
        if (ri.status === "NAO_RECEBIDO" || ri.quantidadeRecebida == null || ri.quantidadeRecebida <= 0) return [];
        return [
          prisma.stockMovement.create({
            data: {
              ingredientId: it.ingredientId,
              empresaId: purchase!.empresaId,
              type: "ENTRADA",
              quantidade: ri.quantidadeRecebida,
              estoqueApos: it.ingredient.estoqueAtual + ri.quantidadeRecebida,
              motivo: `Recebimento — ${purchase!.supplier.nomeFantasia ?? purchase!.supplier.razaoSocial} (pedido ${purchase!.id.slice(-5).toUpperCase()})`,
              origin: "COMPRA",
              origem: purchase!.supplier.nomeFantasia ?? purchase!.supplier.razaoSocial,
              autorizadoPor: responsavelNome,
              createdById: responsavelId,
            },
          }),
          prisma.ingredient.update({
            where: { id: it.ingredientId },
            data: {
              estoqueAtual: { increment: ri.quantidadeRecebida },
              precoAtual: ri.precoInformado ?? it.valorUnitario,
              lastPurchaseDate: new Date(),
            },
          }),
        ];
      })
    : [];

  await prisma.$transaction([
    prisma.receiving.update({
      where: { id: purchase!.receiving.id },
      data: {
        dataFim: new Date(),
        status: houveDivergencia ? "AGUARDANDO_SOLUCAO" : "APROVADO",
        divergencias: houveDivergencia
          ? [...new Set(purchase!.items.flatMap((it) => it.receivingItem?.divergenciaTipos?.split(",") ?? []))].join(",")
          : null,
      },
    }),
    prisma.purchase.update({
      where: { id: purchase!.id },
      data: { status: houveDivergencia ? "DIVERGENCIA" : "RECEBIDO" },
    }),
    ...movimentos,
  ]);

  return NextResponse.json({ ok: true, houveDivergencia });
}
