import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadPurchaseByToken, logPurchaseEvent, notifyReceivingDivergence, receivingState } from "@/lib/recebimento-server";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
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

  const valorPedido = purchase!.items.reduce((s, it) => s + it.valorTotal, 0) + purchase!.frete - purchase!.desconto;
  const valorNotaInformado = body.valorNota != null && body.valorNota !== "" ? Number(body.valorNota) : null;

  await prisma.$transaction([
    prisma.receiving.update({
      where: { id: purchase!.receiving.id },
      data: {
        dataFim: new Date(),
        status: houveDivergencia ? "AGUARDANDO_SOLUCAO" : "APROVADO",
        divergencias: houveDivergencia
          ? [...new Set(purchase!.items.flatMap((it) => it.receivingItem?.divergenciaTipos?.split(",") ?? []))].join(",")
          : null,
        numeroNotaInformado: body.numeroNota || null,
        valorNotaInformado,
        fotoNotaUrl: body.fotoNotaUrl || null,
      },
    }),
    prisma.purchase.update({
      where: { id: purchase!.id },
      data: { status: houveDivergencia ? "DIVERGENCIA" : "RECEBIDO" },
    }),
    ...movimentos,
  ]);

  await logPurchaseEvent({
    purchaseId: purchase!.id,
    empresaId: purchase!.empresaId,
    action: houveDivergencia ? "Recebimento finalizado com divergência" : "Recebimento finalizado",
    userId: purchase!.responsavelRecebimentoId,
  });

  if (houveDivergencia) {
    const divergenciasCount = purchase!.items.filter(
      (it) => it.receivingItem?.status === "DIVERGENCIA" || it.receivingItem?.status === "NAO_RECEBIDO"
    ).length;
    const valorRecebido = purchase!.items.reduce(
      (s, it) => s + (it.receivingItem?.quantidadeRecebida ?? 0) * (it.receivingItem?.precoInformado ?? it.valorUnitario),
      0
    );
    const impactoFinanceiro = (valorNotaInformado ?? valorRecebido) - valorPedido;
    await notifyReceivingDivergence(purchase!, {
      totalItens: purchase!.items.length,
      divergencias: divergenciasCount,
      impactoFinanceiro,
    });
    await logPurchaseEvent({
      purchaseId: purchase!.id,
      empresaId: purchase!.empresaId,
      action: "Gerente notificado sobre divergência",
      userId: purchase!.responsavelRecebimentoId,
    });
  }

  return NextResponse.json({ ok: true, houveDivergencia, valorPedido, valorNotaInformado });
}
